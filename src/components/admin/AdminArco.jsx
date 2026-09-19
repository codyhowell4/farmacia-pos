import React, { useState, useEffect, useMemo } from 'react';
import { FileWarning, Search, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { getArcoRequests, updateArcoRequest } from '@/lib/db';

const TIPO_LABELS = {
  acceso: 'Acceso',
  rectificacion: 'Rectificación',
  cancelacion: 'Cancelación',
  oposicion: 'Oposición',
  revocacion: 'Revocación',
};

const TIPO_BADGE = {
  acceso: 'bg-blue-100 text-blue-700',
  rectificacion: 'bg-amber-100 text-amber-700',
  cancelacion: 'bg-red-100 text-red-700',
  oposicion: 'bg-orange-100 text-orange-700',
  revocacion: 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
};

const STATUS_BADGE = {
  pendiente: 'bg-red-100 text-red-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  resuelta: 'bg-green-100 text-green-700',
};

const STATUS_FILTERS = [
  { id: '', label: 'Todas' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'resuelta', label: 'Resueltas' },
];

const AdminArco = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [resolving, setResolving] = useState(null); // request being resolved
  const [responseText, setResponseText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getArcoRequests();
      setRequests(data);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las solicitudes ARCO', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!term) return true;
      return (
        (r.customers?.full_name || '').toLowerCase().includes(term) ||
        (r.customers?.email || '').toLowerCase().includes(term) ||
        (TIPO_LABELS[r.tipo] || r.tipo).toLowerCase().includes(term) ||
        (r.details || '').toLowerCase().includes(term)
      );
    });
  }, [requests, statusFilter, search]);

  const pendingCount = requests.filter((r) => r.status !== 'resuelta').length;

  const markInProcess = async (request) => {
    try {
      const updated = await updateArcoRequest(request.id, { status: 'en_proceso' });
      setRequests((prev) => prev.map((r) => (r.id === request.id ? { ...r, ...updated } : r)));
      logAudit({
        action: AUDIT_ACTIONS.ARCO_REQUEST_UPDATED,
        user,
        details: `Solicitud ARCO (${TIPO_LABELS[request.tipo] || request.tipo}) de ${request.customers?.full_name || 'cliente sin vincular'} marcada en proceso`,
      });
      toast({ title: 'Solicitud en proceso' });
    } catch (e) {
      toast({ title: 'Error al actualizar', description: e.message, variant: 'destructive' });
    }
  };

  const openResolve = (request) => {
    setResolving(request);
    setResponseText(request.response || '');
  };

  const handleResolve = async () => {
    if (!responseText.trim()) {
      toast({ title: 'Respuesta requerida', description: 'Escribe la respuesta o nota de resolución', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateArcoRequest(resolving.id, {
        status: 'resuelta',
        response: responseText.trim(),
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id || null,
      });
      setRequests((prev) => prev.map((r) => (r.id === resolving.id ? { ...r, ...updated } : r)));
      logAudit({
        action: AUDIT_ACTIONS.ARCO_REQUEST_UPDATED,
        user,
        details: `Solicitud ARCO (${TIPO_LABELS[resolving.tipo] || resolving.tipo}) de ${resolving.customers?.full_name || 'cliente sin vincular'} resuelta: ${responseText.trim().slice(0, 200)}`,
      });
      toast({ title: 'Solicitud resuelta' });
      setResolving(null);
      setResponseText('');
    } catch (e) {
      toast({ title: 'Error al resolver', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ARCO / Privacidad</h1>
          <p className="text-sm text-slate-500 mt-1">
            Solicitudes de acceso, rectificación, cancelación, oposición y revocación del consentimiento (LFPDPPP).
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-sm font-semibold w-fit">
            <Clock className="w-4 h-4" />
            {pendingCount} por atender
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === f.id
                  ? 'bg-apolo-navy text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por cliente, tipo o detalle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Requests list */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <FileWarning className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-lg font-medium">Sin solicitudes ARCO</p>
            <p className="text-sm">Las solicitudes registradas por los titulares aparecerán aquí.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <div key={r.id} className="px-4 py-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${TIPO_BADGE[r.tipo] || 'bg-slate-100 text-slate-600'}`}>
                    {TIPO_LABELS[r.tipo] || r.tipo}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_BADGE[r.status] || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABELS[r.status] || r.status}
                  </span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {new Date(r.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>

                <div>
                  <p className="font-medium text-slate-900">
                    {r.customers?.full_name || 'Cliente sin vincular'}
                  </p>
                  {(r.customers?.email || r.customers?.phone) && (
                    <p className="text-xs text-slate-500">
                      {[r.customers?.email, r.customers?.phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                {r.details && (
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2">{r.details}</p>
                )}

                {r.status === 'resuelta' && r.response && (
                  <div className="text-sm bg-green-50 border border-green-200 rounded-lg p-2">
                    <p className="text-xs font-semibold text-green-700 mb-0.5">
                      Respuesta{r.resolved_at ? ` · ${new Date(r.resolved_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                    </p>
                    <p className="text-green-800">{r.response}</p>
                  </div>
                )}

                {r.status !== 'resuelta' && (
                  <div className="flex gap-2 pt-1">
                    {r.status === 'pendiente' && (
                      <Button size="sm" variant="outline" onClick={() => markInProcess(r)}>
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        Marcar en proceso
                      </Button>
                    )}
                    <Button size="sm" onClick={() => openResolve(r)} className="bg-green-600 hover:bg-green-700">
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      Resolver
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve dialog */}
      <Dialog open={!!resolving} onOpenChange={(o) => { if (!o) { setResolving(null); setResponseText(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver solicitud ARCO</DialogTitle>
          </DialogHeader>
          {resolving && (
            <div className="space-y-4">
              <div className="text-sm bg-slate-50 rounded-lg p-3 space-y-1">
                <p><span className="text-slate-500">Tipo:</span> <strong>{TIPO_LABELS[resolving.tipo] || resolving.tipo}</strong></p>
                <p><span className="text-slate-500">Titular:</span> <strong>{resolving.customers?.full_name || 'Cliente sin vincular'}</strong></p>
                {resolving.details && <p className="text-slate-600">{resolving.details}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="arco-response">Respuesta / nota de resolución *</Label>
                <Textarea
                  id="arco-response"
                  placeholder="Describe cómo se atendió la solicitud (se entregó copia del expediente, se corrigió el dato, se suprimió de la lista de promociones, etc.)"
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  className="min-h-[110px]"
                  autoFocus
                />
                <p className="text-xs text-slate-400">
                  Queda registrada con fecha y el usuario que resuelve, como evidencia ante el INAI.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setResolving(null); setResponseText(''); }} disabled={saving}>
                  Cancelar
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleResolve} disabled={saving || !responseText.trim()}>
                  {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  Marcar resuelta
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminArco;
