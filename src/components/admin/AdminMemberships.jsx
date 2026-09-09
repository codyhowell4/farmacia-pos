import React, { useState, useEffect } from 'react';
import { Search, Users, User, ChevronDown, ChevronUp, Edit2, Loader2, RefreshCw, Activity, UserPlus, Trash2, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { getMemberships, searchMemberships, updateMembership, processMembershipRenewals, getTrackerFulfillments, fulfillMembershipTrackers, recordMembershipPayment, getPendingMemberRevisions } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatMXN } from '@/lib/currency';

const PAYPAL_STATUS_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-subscription-status`;

const ROSTER_COOLDOWN_DAYS = 90;

const ROSTER_ERROR_MESSAGES = {
  roster_full: 'El plan familiar permite hasta 5 integrantes adicionales.',
  member_not_found: 'No se encontró al integrante.',
  cannot_remove_owner: 'No se puede quitar al titular de la membresía.',
  not_authorized: 'No tienes autorización para cambiar los integrantes.',
  name_required: 'Escribe el nombre del integrante.',
  membership_not_found: 'No se encontró la membresía.',
  invalid_action: 'Acción no válida.',
};

const formatDate = (value) => {
  if (!value) return '—';
  let d;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(value);
  }
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getNextRosterChangeDate = (membership) => {
  if (!membership?.last_roster_change_at) return null;
  const last = new Date(membership.last_roster_change_at);
  if (Number.isNaN(last.getTime())) return null;
  const next = new Date(last.getTime() + ROSTER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  return next > new Date() ? next : null;
};

const syncStatusToPayPal = async (subscriptionId, status) => {
  if (!subscriptionId) return null;

  const actionMap = {
    active: 'activate',
    paused: 'suspend',
    cancelled: 'cancel',
    expired: 'cancel',
  };

  const action = actionMap[status];
  if (!action) return null;

  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(PAYPAL_STATUS_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ subscription_id: subscriptionId, action }),
  });

  const result = await res.json();
  if (!res.ok || result.error) {
    throw new Error(result.error || 'Error al sincronizar con PayPal');
  }

  return result;
};

const statusConfig = {
  active: { label: 'Activo', className: 'bg-green-100 text-green-800' },
  paused: { label: 'Pausado', className: 'bg-yellow-100 text-yellow-800' },
  cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
  expired: { label: 'Expirado', className: 'bg-slate-100 text-slate-800' },
  pending_payment: { label: 'Pago pendiente', className: 'bg-amber-100 text-amber-800' },
};

const StatusBadge = ({ status }) => {
  const s = statusConfig[status] || statusConfig.active;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const AdminMemberships = () => {
  const [memberships, setMemberships] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [view, setView] = useState('memberships');
  const [trackers, setTrackers] = useState([]);
  const [trackersLoading, setTrackersLoading] = useState(false);
  const [fulfillingId, setFulfillingId] = useState(null);
  const [revisionsByMembership, setRevisionsByMembership] = useState({});
  const [loadingRevisions, setLoadingRevisions] = useState({});
  const [recordingPaymentId, setRecordingPaymentId] = useState(null);
  const [newMemberName, setNewMemberName] = useState('');
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingMemberName, setEditingMemberName] = useState('');
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterOverride, setRosterOverride] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = searchTerm.trim()
        ? await searchMemberships(searchTerm.trim())
        : await getMemberships();
      setMemberships(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las membresías', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTrackers = async () => {
    setTrackersLoading(true);
    try {
      const data = await getTrackerFulfillments();
      setTrackers(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'No se pudieron cargar las entregas de rastreadores', variant: 'destructive' });
    } finally {
      setTrackersLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!expandedId) return;
    const loadRevisions = async () => {
      setLoadingRevisions((prev) => ({ ...prev, [expandedId]: true }));
      try {
        const data = await getPendingMemberRevisions(expandedId);
        setRevisionsByMembership((prev) => ({ ...prev, [expandedId]: data || [] }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingRevisions((prev) => ({ ...prev, [expandedId]: false }));
      }
    };
    loadRevisions();
  }, [expandedId]);

  useEffect(() => {
    if (view === 'trackers') loadTrackers();
  }, [view]);

  useEffect(() => {
    const timer = setTimeout(loadData, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setNewMemberName('');
    setEditingMemberId(null);
    setEditingMemberName('');
    setRosterOverride(false);
  }, [editing?.id]);

  const handleFulfillTracker = async (membership) => {
    setFulfillingId(membership.id);
    try {
      await fulfillMembershipTrackers(membership.id, 1);
      toast({ title: 'Rastreador entregado', description: `${membership.customers?.full_name || membership.plan_id}` });
      await loadTrackers();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setFulfillingId(null);
    }
  };

  const handleRecordPayment = async (membership) => {
    setRecordingPaymentId(membership.id);
    try {
      await recordMembershipPayment(membership.id);
      toast({ title: 'Pago registrado', description: `Se registró el pago de ${membership.plan_id}` });
      await loadData();
      if (expandedId === membership.id) {
        const data = await getPendingMemberRevisions(membership.id);
        setRevisionsByMembership((prev) => ({ ...prev, [membership.id]: data || [] }));
      }
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRecordingPaymentId(null);
    }
  };

  const handleProcessRenewals = async () => {
    setProcessing(true);
    try {
      const count = await processMembershipRenewals();
      toast({ title: 'Renovaciones procesadas', description: `${count} membresía(s) actualizada(s).` });
      await loadData();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const refreshEditingMembership = async () => {
    if (!editing) return;
    const { data, error } = await supabase
      .from('memberships')
      .select('*, customers(*), membership_members(*)')
      .eq('id', editing.id)
      .single();
    if (error) {
      console.error(error);
      return;
    }
    setEditing((prev) => {
      if (!prev) return prev;
      return {
        ...data,
        customers: {
          ...data.customers,
          full_name: prev.customers?.full_name,
          email: prev.customers?.email,
          phone: prev.customers?.phone,
        },
        discount_percent: prev.discount_percent,
        visits_remaining: prev.visits_remaining,
        status: prev.status,
      };
    });
  };

  const handleManageMember = async (action, { memberId = null, name = null } = {}) => {
    if (!editing) return false;
    setRosterBusy(true);
    try {
      const { data, error } = await supabase.rpc('manage_family_member', {
        p_membership_id: editing.id,
        p_action: action,
        p_member_id: memberId,
        p_name: name,
        p_override: isAdmin && rosterOverride,
      });
      if (error) throw error;
      if (!data?.success) {
        const code = data?.error;
        if (code === 'roster_locked') {
          toast({
            title: 'Cambios de integrantes bloqueados',
            description: `Próximo cambio de integrantes disponible el ${formatDate(data?.next_change_date)}.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'No se pudo aplicar el cambio',
            description: ROSTER_ERROR_MESSAGES[code] || 'Ocurrió un error inesperado.',
            variant: 'destructive',
          });
        }
        return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
      return false;
    } finally {
      setRosterBusy(false);
    }
  };

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    if (!name) {
      toast({ title: 'Verifica los datos', description: 'Escribe el nombre del integrante.', variant: 'destructive' });
      return;
    }
    const ok = await handleManageMember('add', { name });
    if (ok) {
      setNewMemberName('');
      toast({ title: 'Integrante agregado', description: name });
      await refreshEditingMembership();
      await loadData();
    }
  };

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`¿Quitar a ${member.name} de la membresía ${editing?.plan_id || ''}?`)) return;
    const ok = await handleManageMember('remove', { memberId: member.id });
    if (ok) {
      toast({ title: 'Integrante eliminado', description: member.name });
      await refreshEditingMembership();
      await loadData();
    }
  };

  const handleSaveMemberName = async (member) => {
    const name = editingMemberName.trim();
    if (!name) {
      toast({ title: 'Verifica los datos', description: 'Escribe el nombre del integrante.', variant: 'destructive' });
      return;
    }
    if (name === member.name) {
      setEditingMemberId(null);
      return;
    }
    const ok = await handleManageMember('edit', { memberId: member.id, name });
    if (ok) {
      setEditingMemberId(null);
      toast({ title: 'Nombre actualizado' });
      await refreshEditingMembership();
      await loadData();
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const original = memberships.find((m) => m.id === editing.id);
    const statusChanged = original && original.status !== editing.status;

    try {
      await updateMembership(editing.id, {
        customerUpdates: {
          full_name: editing.customers?.full_name,
          email: editing.customers?.email,
          phone: editing.customers?.phone,
        },
        membershipUpdates: {
          discount_percent: Number(editing.discount_percent),
          visits_remaining: Number(editing.visits_remaining),
          status: editing.status,
        },
      });

      if (
        statusChanged &&
        editing.payment_processor === 'paypal' &&
        editing.processor_subscription_id
      ) {
        try {
          await syncStatusToPayPal(editing.processor_subscription_id, editing.status);
        } catch (paypalErr) {
          console.error('PayPal sync failed:', paypalErr);
          toast({
            title: 'Membresía actualizada localmente',
            description: `No se pudo sincronizar con PayPal: ${paypalErr.message}`,
            variant: 'destructive',
          });
          setEditing(null);
          await loadData();
          return;
        }
      }

      toast({ title: 'Membresía actualizada' });
      setEditing(null);
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const editingNextRosterChange = editing ? getNextRosterChangeDate(editing) : null;
  const editingRosterLocked = !!editingNextRosterChange;
  const editingNonOwnerCount = (editing?.membership_members || []).filter((mm) => !mm.is_owner).length;
  const editingRosterFull = editingNonOwnerCount >= 5;
  const rosterChangesDisabled = rosterBusy || (editingRosterLocked && !(isAdmin && rosterOverride));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membresías</h1>
          <p className="text-sm text-slate-500">Administra los planes de membresía Apolo.</p>
        </div>
        <Button variant="outline" size="sm" disabled={processing} onClick={handleProcessRenewals}>
          {processing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Procesar renovaciones
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          variant={view === 'memberships' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('memberships')}
        >
          <Users className="w-4 h-4 mr-1" /> Membresías
        </Button>
        <Button
          variant={view === 'trackers' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('trackers')}
        >
          <Activity className="w-4 h-4 mr-1" /> Rastreadores
        </Button>
      </div>

      {view === 'trackers' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Entrega de rastreadores básicos</h2>
              <p className="text-xs text-slate-500">
                {trackers.reduce((sum, t) => sum + t.trackers_pending, 0)} pendiente(s) por entregar
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadTrackers} disabled={trackersLoading}>
              <RefreshCw className={`w-4 h-4 ${trackersLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {trackersLoading ? (
            <div className="py-12 text-center text-slate-500">Cargando entregas...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Plan ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Nombre</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Teléfono</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Plan</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Entregados</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Pendientes</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-900">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {trackers.map((t) => (
                    <tr key={t.id} className={t.trackers_pending > 0 ? 'bg-amber-50/40' : ''}>
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{t.plan_id}</td>
                      <td className="px-4 py-3 text-slate-900">{t.customers?.full_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{t.customers?.phone || '—'}</td>
                      <td className="px-4 py-3 capitalize text-slate-700">
                        {t.plan_type === 'familiar' ? 'Familiar' : 'Individual'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-slate-700">
                        {t.basic_trackers_fulfilled || 0} / {t.basic_trackers_included || 0}
                      </td>
                      <td className="px-4 py-3">
                        {t.trackers_pending > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {t.trackers_pending} pendiente(s)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Completo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={t.trackers_pending <= 0 || fulfillingId === t.id}
                          onClick={() => handleFulfillTracker(t)}
                        >
                          {fulfillingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entregar 1'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {trackers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                        Ninguna membresía incluye rastreadores todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'memberships' && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por ID, nombre, teléfono o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">Cargando membresías...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Plan ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Nombre</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Correo</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Miembros</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {memberships.map((m) => (
                  <React.Fragment key={m.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">{m.plan_id}</td>
                      <td className="px-4 py-3 text-slate-900">{m.customers?.full_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{m.customers?.phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{m.customers?.email || '—'}</td>
                      <td className="px-4 py-3 capitalize text-slate-700">
                        {m.plan_type === 'familiar' ? 'Familiar' : 'Individual'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                          className="flex items-center gap-1 text-apolo-navy hover:text-apolo-navy-dark"
                        >
                          {m.plan_type === 'familiar'
                            ? `${m.membership_members?.length || 0} miembros`
                            : 'Detalles'}
                          {expandedId === m.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={m.status} />
                          {m.pending_cancellation && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                              Cancela el {formatDate(m.next_renewal_date)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ ...m, customers: { ...m.customers } })}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {m.status === 'pending_payment' && m.payment_method === 'cash' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={recordingPaymentId === m.id}
                              onClick={() => handleRecordPayment(m)}
                            >
                              {recordingPaymentId === m.id ? '...' : 'Registrar pago'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === m.id && (
                      <tr>
                        <td colSpan={8} className="px-4 py-3 bg-slate-50">
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Procesador</p>
                                <p className="capitalize">{m.payment_processor || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">ID de suscripción PayPal</p>
                                <p className="font-mono text-xs break-all">{m.processor_subscription_id || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Rastreadores básicos</p>
                                <p>{m.basic_trackers_fulfilled || 0} / {m.basic_trackers_included || 0} entregados</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Renovación</p>
                                <p>{m.next_renewal_date || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Pagos acumulados</p>
                                <p>{m.payments_made || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Revisiones pendientes</p>
                                {loadingRevisions[m.id] ? (
                                  <p>Cargando...</p>
                                ) : (
                                  <p>
                                    {(revisionsByMembership[m.id] || []).length > 0
                                      ? `${revisionsByMembership[m.id].length} pendiente(s)`
                                      : 'Ninguna'}
                                  </p>
                                )}
                              </div>
                              {m.pending_cancellation && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase">Cancelación programada</p>
                                  <p>Activa hasta el {formatDate(m.next_renewal_date)}</p>
                                </div>
                              )}
                            </div>

                            {m.plan_type === 'familiar' && (
                              <>
                                <p className="text-xs font-semibold text-slate-500 uppercase">Miembros del plan</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                                  {(m.membership_members || []).map((mm) => (
                                    <div key={mm.id} className="bg-white border rounded p-2 text-sm">
                                      <p className="font-medium text-slate-900">{mm.name}</p>
                                      <p className="text-xs text-slate-500 font-mono">{mm.sub_id}</p>
                                      {mm.is_owner && <span className="text-xs text-apolo-navy">Titular</span>}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {memberships.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {searchTerm ? 'No se encontraron membresías con ese criterio' : 'No hay membresías registradas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className={`${editing?.plan_type === 'familiar' ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>Editar membresía</DialogTitle>
          </DialogHeader>
          {editing && (
            <>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <Label>Plan ID</Label>
                <Input value={editing.plan_id} disabled />
              </div>
              <div>
                <Label>Nombre</Label>
                <Input
                  value={editing.customers?.full_name || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      customers: { ...editing.customers, full_name: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={editing.customers?.phone || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      customers: { ...editing.customers, phone: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>Correo</Label>
                <Input
                  value={editing.customers?.email || ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      customers: { ...editing.customers, email: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>Descuento (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editing.discount_percent}
                  onChange={(e) => setEditing({ ...editing, discount_percent: e.target.value })}
                />
              </div>
              <div>
                <Label>Consultas restantes</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.visits_remaining}
                  onChange={(e) => setEditing({ ...editing, visits_remaining: e.target.value })}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
                >
                  {Object.keys(statusConfig).map((s) => (
                    <option key={s} value={s}>
                      {statusConfig[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar cambios</Button>
              </div>
            </form>

            {editing.plan_type === 'familiar' && (
              <div className="border-t pt-4 mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Integrantes</h3>
                  <span className="text-xs text-slate-500">{editingNonOwnerCount} de 5 adicionales</span>
                </div>

                {editingRosterLocked && (
                  <p className="text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded px-3 py-2">
                    Próximo cambio de integrantes disponible el {formatDate(editingNextRosterChange)}.
                  </p>
                )}

                <div className="space-y-2">
                  {(editing.membership_members || []).map((mm) => (
                    <div key={mm.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        {editingMemberId === mm.id ? (
                          <Input
                            value={editingMemberName}
                            onChange={(e) => setEditingMemberName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveMemberName(mm);
                              }
                            }}
                            disabled={rosterBusy}
                            autoFocus
                          />
                        ) : (
                          <>
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {mm.name}
                              {mm.is_owner && <span className="ml-2 text-xs font-normal text-apolo-navy">Titular</span>}
                            </p>
                            <p className="text-xs text-slate-500 font-mono">{mm.sub_id}</p>
                          </>
                        )}
                      </div>
                      {editingMemberId === mm.id ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={rosterBusy}
                            onClick={() => handleSaveMemberName(mm)}
                            title="Guardar nombre"
                          >
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={rosterBusy}
                            onClick={() => setEditingMemberId(null)}
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={rosterBusy}
                            onClick={() => {
                              setEditingMemberId(mm.id);
                              setEditingMemberName(mm.name);
                            }}
                            title="Corregir nombre"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {!mm.is_owner && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={rosterChangesDisabled}
                              onClick={() => handleRemoveMember(mm)}
                              title="Quitar integrante"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Nombre del nuevo integrante"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMember();
                      }
                    }}
                    disabled={rosterChangesDisabled || editingRosterFull}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={rosterChangesDisabled || editingRosterFull || !newMemberName.trim()}
                    onClick={handleAddMember}
                  >
                    {rosterBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
                    Agregar
                  </Button>
                </div>
                {editingRosterFull && (
                  <p className="text-xs text-slate-500">El plan familiar permite hasta 5 integrantes adicionales.</p>
                )}

                {isAdmin && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rosterOverride}
                      onChange={(e) => setRosterOverride(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Autorizar cambio (admin) — ignora la regla de los 90 días
                  </label>
                )}
              </div>
            )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMemberships;
