import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Link2, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getAkauntingSettings, saveAkauntingSettings } from '@/lib/db';
import * as akauntingApi from '@/services/akauntingApi';

const AkauntingConnectionCard = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null); // 'ok' | 'error' | null

  const [settings, setSettings] = useState({
    apiUrl: '',
    companyId: '',
    apiEmail: '',
    apiPassword: '',
    enabled: false,
    syncCustomers: true,
    syncSales: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getAkauntingSettings();
      if (data) {
        setSettings({
          apiUrl: data.api_url || '',
          companyId: data.company_id || '',
          apiEmail: data.api_email || '',
          apiPassword: data.api_password ? '••••••••' : '',
          enabled: data.enabled || false,
          syncCustomers: data.sync_customers ?? true,
          syncSales: data.sync_sales ?? true,
        });
      }
    } catch (e) {
      console.error('Error cargando configuración de Akaunting:', e);
    }
  };

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setConnectionStatus(null);
  };

  const handleSave = async () => {
    if (!settings.apiUrl || !settings.companyId || !settings.apiEmail) {
      toast({ title: 'Datos incompletos', description: 'URL, ID de empresa y email son requeridos.', variant: 'destructive' });
      return;
    }

    const companyIdNum = parseInt(settings.companyId, 10);
    if (isNaN(companyIdNum) || companyIdNum <= 0) {
      toast({ title: 'ID de empresa inválido', description: 'Ingresa un número entero positivo.', variant: 'destructive' });
      return;
    }

    let passwordToSave = settings.apiPassword;
    // If password field still shows mask, preserve existing password from DB
    if (passwordToSave === '••••••••') {
      try {
        const existing = await getAkauntingSettings();
        if (existing?.api_password) {
          passwordToSave = existing.api_password;
        } else {
          toast({ title: 'Contraseña requerida', description: 'Ingresa la contraseña de la API.', variant: 'destructive' });
          return;
        }
      } catch {
        toast({ title: 'Contraseña requerida', description: 'Ingresa la contraseña de la API.', variant: 'destructive' });
        return;
      }
    }
    if (!passwordToSave) {
      toast({ title: 'Contraseña requerida', description: 'Ingresa la contraseña de la API.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await saveAkauntingSettings({
        apiUrl: settings.apiUrl.trim(),
        companyId: companyIdNum,
        apiEmail: settings.apiEmail.trim(),
        apiPassword: passwordToSave,
        enabled: settings.enabled,
        syncCustomers: settings.syncCustomers,
        syncSales: settings.syncSales,
      });
      // Mask password again after save
      setSettings((prev) => ({ ...prev, apiPassword: '••••••••' }));
      setDirty(false);
      toast({ title: 'Configuración guardada' });
    } catch (e) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!settings.apiUrl || !settings.companyId || !settings.apiEmail || !settings.apiPassword) {
      toast({ title: 'Datos incompletos', description: 'Llena todos los campos antes de probar.', variant: 'destructive' });
      return;
    }

    setTesting(true);
    setConnectionStatus(null);
    try {
      akauntingApi.configureClient({
        apiUrl: settings.apiUrl.trim(),
        companyId: parseInt(settings.companyId, 10),
        apiEmail: settings.apiEmail.trim(),
        apiPassword: settings.apiPassword,
      });
      const testRes = await akauntingApi.testConnection();
      if (testRes.ok) {
        setConnectionStatus('ok');
        toast({ title: 'Conexión exitosa', description: 'Akaunting respondió correctamente con acceso a la API.' });
      } else if (testRes.pingOnly) {
        setConnectionStatus('warning');
        toast({
          title: 'Servidor disponible pero API bloqueada',
          description: testRes.error || 'Akaunting respondió al ping pero las credenciales no tienen acceso a la API. Verifica permisos read-api y de contactos.',
          variant: 'destructive',
        });
      }
    } catch (e) {
      setConnectionStatus('error');
      toast({ title: 'Error de conexión', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const openAkaunting = () => {
    if (settings.apiUrl) {
      window.open(settings.apiUrl.replace(/\/$/, ''), '_blank');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg p-6 max-w-2xl space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg">
          <Link2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">Conexión con Akaunting</h3>
          <p className="text-sm text-slate-500">
            Configura la integración con tu instancia de Akaunting
          </p>
        </div>
        {connectionStatus === 'ok' && (
          <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Conectado
          </span>
        )}
        {connectionStatus === 'warning' && (
          <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
            <XCircle className="w-3 h-3" /> Ping OK — API bloqueada
          </span>
        )}
        {connectionStatus === 'error' && (
          <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
            <XCircle className="w-3 h-3" /> Error
          </span>
        )}
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="akaunting-url">URL de Akaunting *</Label>
          <Input
            id="akaunting-url"
            type="url"
            placeholder="https://accounting.tufarmacia.com"
            value={settings.apiUrl}
            onChange={(e) => update('apiUrl', e.target.value)}
          />
          <p className="text-xs text-slate-500">La URL base de tu instalación de Akaunting</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="company-id">ID de Empresa *</Label>
          <Input
            id="company-id"
            type="number"
            min="1"
            placeholder="1"
            value={settings.companyId}
            onChange={(e) => update('companyId', e.target.value)}
          />
          <p className="text-xs text-slate-500">ID de la empresa en Akaunting</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-email">Email de API *</Label>
          <Input
            id="api-email"
            type="email"
            placeholder="admin@tufarmacia.com"
            value={settings.apiEmail}
            onChange={(e) => update('apiEmail', e.target.value)}
          />
          <p className="text-xs text-slate-500">Usuario con permiso read-api</p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="api-password">Contraseña de API *</Label>
          <Input
            id="api-password"
            type="password"
            placeholder="••••••••"
            value={settings.apiPassword}
            onChange={(e) => update('apiPassword', e.target.value)}
          />
          <p className="text-xs text-slate-500">Contraseña del usuario de API</p>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-medium">Activar integración</Label>
            <p className="text-sm text-slate-500">Habilita la sincronización con Akaunting</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => update('enabled', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-medium">Sincronizar clientes</Label>
            <p className="text-sm text-slate-500">Envía clientes de Farmacia a Akaunting</p>
          </div>
          <Switch
            checked={settings.syncCustomers}
            onCheckedChange={(checked) => update('syncCustomers', checked)}
            disabled={!settings.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-medium">Sincronizar ventas</Label>
            <p className="text-sm text-slate-500">Envía ventas como facturas a Akaunting</p>
          </div>
          <Switch
            checked={settings.syncSales}
            onCheckedChange={(checked) => update('syncSales', checked)}
            disabled={!settings.enabled}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={!dirty || loading}
          className="bg-gradient-to-r from-blue-500 to-indigo-600"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar configuración
        </Button>

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
          Probar conexión
        </Button>

        {settings.apiUrl && (
          <Button
            variant="ghost"
            onClick={openAkaunting}
            className="text-slate-600"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Abrir Akaunting
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default AkauntingConnectionCard;
