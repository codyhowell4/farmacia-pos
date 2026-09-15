import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PenLine } from 'lucide-react';
import { getDoctorProfile } from '@/lib/db';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import {
  hasStoredEfirma, signRecetaWithPassword, readFileAsBase64,
  setEfirmaSessionPassword,
} from '@/lib/efirma';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Electronic signature (e.firma/FIEL) flow for a receta.
 * STORED FILES: doctor saved their .cer/.key in Mi perfil — only the
 * password is needed here; optionally keep it unlocked for the session
 * so new recetas are auto-signed.
 * ONE-OFF FILES: upload .cer/.key just for this signature (never stored).
 * WET INK: doctor without e.firma — the printed receta keeps the
 * signature line with the cédula profesional.
 */
const SignRecetaButton = ({ prescription, customer, onSigned }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [cerFile, setCerFile] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!open || !user?.id) return;
    getDoctorProfile(user.id)
      .then(setDoctorProfile)
      .catch(() => setDoctorProfile(null));
  }, [open, user?.id]);

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

  const stored = hasStoredEfirma(doctorProfile);

  const handleSign = async () => {
    if (!password) {
      toast.error('Ingresa la contraseña de tu llave privada');
      return;
    }
    if (!stored && (!cerFile || !keyFile)) {
      toast.error('Selecciona los archivos .cer y .key e ingresa la contraseña');
      return;
    }

    setSigning(true);
    try {
      let files = doctorProfile;
      if (!stored) {
        const [cer_base64, key_base64] = await Promise.all([
          readFileAsBase64(cerFile),
          readFileAsBase64(keyFile),
        ]);
        files = { efirma_cer_base64: cer_base64, efirma_key_base64: key_base64 };
      }

      const data = await signRecetaWithPassword(prescription, customer, files, password);
      if (remember && user?.id) setEfirmaSessionPassword(user.id, password);

      await logAudit({
        action: AUDIT_ACTIONS.RECETA_SIGN,
        user,
        details: `Receta ${prescription.prescription_number || prescription.id} firmada electrónicamente (cert ${data.cert_serial})`,
      });

      toast.success('Receta firmada electrónicamente');
      setOpen(false);
      setPassword('');
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
            {/* STORED e.firma — password only */}
            {stored ? (
              <div className="space-y-3 rounded-md border p-3">
                <h4 className="text-sm font-semibold">Firmar con tu e.firma guardada</h4>
                <p className="text-xs text-muted-foreground">
                  Usando los archivos .cer/.key de tu perfil
                  {doctorProfile?.efirma_cert_serial ? ` (cert ${doctorProfile.efirma_cert_serial})` : ''}.
                </p>
                <div>
                  <Label htmlFor="sign-password-stored">Contraseña de la llave privada</Label>
                  <Input
                    id="sign-password-stored"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Mantener desbloqueada durante esta sesión (las recetas nuevas se firman solas)
                </label>
                <div className="flex gap-2">
                  <Button onClick={handleSign} disabled={signing} className="flex-1">
                    {signing ? 'Firmando…' : 'Firmar electrónicamente'}
                  </Button>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={signing}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              /* ONE-OFF FILES */
              <div className="space-y-3 rounded-md border p-3">
                <h4 className="text-sm font-semibold">Firmar con e.firma (FIEL)</h4>
                <p className="text-xs text-muted-foreground">
                  Sube tus archivos .cer y .key del SAT y escribe la contraseña de tu
                  llave privada. Los archivos solo se usan para generar la firma y no
                  se guardan. Para no subirlos cada vez, guárdalos una vez en
                  <strong> Mi perfil → Firma electrónica</strong>.
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
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    Mantener desbloqueada durante esta sesión (requiere archivos guardados en Mi perfil)
                  </label>
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
            )}

            {/* WET INK */}
            <div className="space-y-1 rounded-md border border-dashed p-3">
              <h4 className="text-sm font-semibold">Sin e.firma</h4>
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
