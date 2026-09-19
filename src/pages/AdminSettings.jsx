import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Save, Settings, Percent, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { getTaxSettings, formatMXN, calcIVA } from '@/lib/currency';
import { getTaxSettingsDb, saveTaxSettingsDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { getOrgInfo, clearOrgInfoCache, resolveOrgId } from '@/lib/orgInfo';
import BankAccountSettings from '@/components/admin/BankAccountSettings';

const AdminSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState(getTaxSettings());
  const [dirty, setDirty] = useState(false);
  const [ticketData, setTicketData] = useState({ rfc: '', aviso_funcionamiento: '', responsable_sanitario: '' });
  const [ticketDirty, setTicketDirty] = useState(false);
  const [ticketSaving, setTicketSaving] = useState(false);

  useEffect(() => {
    getTaxSettingsDb().then(s => setSettings({ ivaEnabled: s.iva_enabled, ivaRate: s.iva_rate })).catch(console.error);
    getOrgInfo().then(info => setTicketData({
      rfc: info.rfc || '',
      aviso_funcionamiento: info.aviso_funcionamiento || '',
      responsable_sanitario: info.responsable_sanitario || '',
    })).catch(console.error);
  }, []);

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    const rate = parseFloat(settings.ivaRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({ title: 'Tasa IVA inválida', description: 'Ingresa un porcentaje entre 0 y 100.', variant: 'destructive' });
      return;
    }
    try {
      await saveTaxSettingsDb({ ...settings, ivaRate: rate });
      setDirty(false);
      toast({ title: 'Configuración guardada' });
    } catch (e) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    }
  };

  const updateTicket = (key, value) => {
    setTicketData(prev => ({ ...prev, [key]: value }));
    setTicketDirty(true);
  };

  const handleSaveTicket = async () => {
    setTicketSaving(true);
    try {
      const orgId = await resolveOrgId();
      if (!orgId) throw new Error('No se pudo determinar la organización');
      const { error } = await supabase
        .from('organizations')
        .update({
          rfc: ticketData.rfc.trim() || null,
          aviso_funcionamiento: ticketData.aviso_funcionamiento.trim() || null,
          responsable_sanitario: ticketData.responsable_sanitario.trim() || null,
        })
        .eq('id', orgId);
      if (error) throw error;
      clearOrgInfoCache();
      setTicketDirty(false);
      toast({ title: 'Datos del ticket guardados' });
    } catch (e) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    } finally {
      setTicketSaving(false);
    }
  };

  // Preview on a sample subtotal
  const sampleSubtotal = 500;
  const ivaAmount = calcIVA(sampleSubtotal, settings);
  const total = sampleSubtotal + ivaAmount;

  return (
    <>
      <Helmet><title>Configuración - Farmacia</title></Helmet>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Configuración</h2>
          <p className="text-slate-600">Ajustes generales del sistema</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 max-w-xl space-y-6">

          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="bg-gradient-to-br from-apolo-navy to-apolo-navy-dark p-2 rounded-lg">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Impuestos</h3>
              <p className="text-sm text-slate-500">Configuración del IVA aplicado en ventas</p>
            </div>
          </div>

          {/* IVA toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Activar IVA</Label>
              <p className="text-sm text-slate-500 mt-0.5">Aplica IVA al total de cada venta en el punto de venta</p>
            </div>
            <button
              onClick={() => update('ivaEnabled', !settings.ivaEnabled)}
              className={`relative flex items-center w-14 h-7 rounded-full transition-colors ${settings.ivaEnabled ? 'bg-apolo-navy' : 'bg-slate-300'}`}
            >
              <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${settings.ivaEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* IVA rate */}
          <div className={`space-y-2 transition-opacity ${settings.ivaEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <Label htmlFor="iva-rate">Tasa IVA (%)</Label>
            <div className="relative max-w-xs">
              <Percent className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                id="iva-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.ivaRate}
                onChange={e => update('ivaRate', e.target.value)}
                className="pr-9"
              />
            </div>
            <p className="text-xs text-slate-500">Tasa estándar en México: 16%. Tasa reducida fronteriza: 8%.</p>
          </div>

          {/* Live preview */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wide">Vista previa — subtotal de {formatMXN(sampleSubtotal)}</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span><span>{formatMXN(sampleSubtotal)}</span>
              </div>
              {settings.ivaEnabled && (
                <div className="flex justify-between text-slate-600">
                  <span>IVA ({settings.ivaRate}%)</span><span>{formatMXN(ivaAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t pt-1 mt-1">
                <span>Total</span><span>{formatMXN(total)}</span>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={!dirty} className="w-full bg-gradient-to-r from-apolo-navy to-apolo-navy-dark">
            <Save className="w-4 h-4 mr-2" />Guardar configuración
          </Button>
        </motion.div>

        {/* Datos del ticket (fiscal y sanitario) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-xl shadow-lg p-6 max-w-xl space-y-6">

          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="bg-gradient-to-br from-apolo-navy to-apolo-navy-dark p-2 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Datos del ticket (fiscal y sanitario)</h3>
              <p className="text-sm text-slate-500">Se imprimen en el encabezado de cada recibo de venta</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-rfc">RFC</Label>
            <Input
              id="org-rfc"
              value={ticketData.rfc}
              onChange={e => updateTicket('rfc', e.target.value)}
              placeholder="Ej. XAXX010101000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-aviso">Aviso de funcionamiento Nº</Label>
            <Input
              id="org-aviso"
              value={ticketData.aviso_funcionamiento}
              onChange={e => updateTicket('aviso_funcionamiento', e.target.value)}
              placeholder="Número de aviso de funcionamiento COFEPRIS"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-responsable">Responsable sanitario</Label>
            <Input
              id="org-responsable"
              value={ticketData.responsable_sanitario}
              onChange={e => updateTicket('responsable_sanitario', e.target.value)}
              placeholder="Nombre del responsable sanitario"
            />
          </div>

          <Button onClick={handleSaveTicket} disabled={!ticketDirty || ticketSaving} className="w-full bg-gradient-to-r from-apolo-navy to-apolo-navy-dark">
            <Save className="w-4 h-4 mr-2" />{ticketSaving ? 'Guardando…' : 'Guardar datos del ticket'}
          </Button>
        </motion.div>

        {/* Bank Account Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white rounded-xl shadow-lg p-6 max-w-2xl">
          <BankAccountSettings />
        </motion.div>
      </div>
    </>
  );
};

export default AdminSettings;
