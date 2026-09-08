import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PenLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { signPrescription } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { buildRecetaCadena } from '@/lib/cda';
import { useAuth } from '@/contexts/AuthContext';

// Reads a File as a base64 string (without the data: URL prefix).
const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });

/**
 * Electronic signature (e.firma/FIEL) flow for a receta.
 * FLOW A: doctor has SAT e.firma files (.cer/.key + password) — the
 * receta is cryptographically signed via the sign-document edge
 * function and the signature is stored on the prescription.
 * FLOW B: doctor without e.firma — the printed receta keeps the
 * wet-ink signature line with the cédula profesional.
 */
const SignRecetaButton = ({ prescription, customer, onSigned }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [cerFile, setCerFile] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [password, setPassword] = useState('');
  const [signing, setSigning] = useState(false);

  if (!prescription) return null;

  if (prescription.signed_at) {
    const when = new Date(prescription.signed_at).toLocaleString('es-MX');
    return (
      <Badge
        variant="outline"
        className="text-emerald-700 border-emerald-300 bg-emerald-50"
        title={`Firmada el ${when} · cert ${prescription.signer_cert_serial || '—'}`}
      >
        ✒️ Firmada
      </Badge>
    );
  }

  const handleSign = async () => {
    if (!cerFile || !keyFile || !password) {
      toast.error('Selecciona los archivos .cer y .key e ingresa la contraseña');
      return;
    }

    setSigning(true);
    try {
      const [cer_base64, key_base64] = await Promise.all([
        readFileAsBase64(cerFile),
        readFileAsBase64(keyFile),
      ]);

      const cadena = buildRecetaCadena(prescription, customer);

      const { data, error } = await supabase.functions.invoke('sign-document', {
        body: { cer_base64, key_base64, password, payload: cadena },
      });

      if (error) {
        let message = 'No se pudo firmar la receta';
        try {
          const body = await error?.context?.json();
          message = body?.error || body?.message || message;
        } catch { /* keep default message */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      await signPrescription(prescription.id, {
        signed_payload: cadena,
        signature: data.signature_base64,
        signer_cert_serial: data.cert_serial,
        signed_at: new Date().toISOString(),
      });

      await logAudit({
        action: AUDIT_ACTIONS.RECETA_SIGN,
        user,
        details: `Receta ${prescription.prescription_number || prescription.id} firmada electrónicamente (cert ${data.cert_serial})`,
      });

      toast.success('Receta firmada electrónicamente');
      setOpen(false);
      onSigned?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo firmar la receta');
    } finally {
      setSigning(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PenLine className="h-4 w-4 mr-1" />
        Firmar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Firmar receta {prescription.prescription_number || ''}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Hay dos formas de firmar una receta: con tu e.firma del SAT (firma
              electrónica avanzada) o con firma autógrafa sobre la receta impresa.
            </p>

            {/* FLOW A — e.firma */}
            <div className="space-y-3 rounded-md border p-3">
              <h4 className="text-sm font-semibold">Opción A — Firmar con e.firma (FIEL)</h4>
              <p className="text-xs text-muted-foreground">
                Sube tus archivos .cer y .key del SAT y escribe la contraseña de tu
                llave privada. Los archivos solo se usan para generar la firma y no
                se guardan en el sistema.
              </p>
              <div className="space-y-2">
                <div>
                  <Label htmlFor="sign-cer">Certificado (.cer)</Label>
                  <Input
                    id="sign-cer"
                    type="file"
                    accept=".cer"
                    onChange={(e) => setCerFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div>
                  <Label htmlFor="sign-key">Llave privada (.key)</Label>
                  <Input
                    id="sign-key"
                    type="file"
                    accept=".key"
                    onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div>
                  <Label htmlFor="sign-password">Contraseña de la llave privada</Label>
                  <Input
                    id="sign-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSign} disabled={signing} className="flex-1">
                  {signing ? 'Firmando…' : 'Firmar electrónicamente'}
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={signing}>
                  Cancelar
                </Button>
              </div>
            </div>

            {/* FLOW B — wet ink */}
            <div className="space-y-1 rounded-md border border-dashed p-3">
              <h4 className="text-sm font-semibold">Opción B — Sin e.firma</h4>
              <p className="text-xs text-muted-foreground">
                Si no cuentas con e.firma, imprime la receta y fírmala de puño y
                letra. La receta impresa incluye la línea de firma y tu cédula
                profesional. Si tu cédula no aparece, pide a un administrador que
                la capture en el perfil de doctores.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SignRecetaButton;
