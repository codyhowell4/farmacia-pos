import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, RefreshCw, FileSignature, ChevronDown, ChevronUp, Send, MessageCircle, Mail, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { getAllConsentDocuments, getCustomers } from '@/lib/db';

const STATUS_BADGES = {
  signed:   { label: 'Firmado',   color: 'bg-green-100 text-green-700' },
  pending:  { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  declined: { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
};

const STATUS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'signed', label: 'Firmados' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'declined', label: 'Rechazados' },
];

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

// The 3 standard documents every customer signs via the customer-app gate
const REQUIRED_DOCS = [
  { type: 'privacidad', title: 'Aviso de Privacidad' },
  { type: 'general', title: 'Consentimiento Informado General' },
  { type: 'teleconsulta', title: 'Consentimiento para Teleconsulta' },
];

// wa.me needs digits with country code; Mexican mobile numbers are 10 digits
const normalizePhoneForWhatsApp = (phone) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 10 ? '52' + digits : digits;
};

const buildSendMessage = (customer, missingDocs, link) => {
  const docList = missingDocs.map((d, i) => `${i + 1}) ${d.title}`).join('\n');
  return `Hola ${customer.full_name || ''}, te enviamos ${missingDocs.length === 1 ? 'el documento de consentimiento pendiente' : 'los documentos de consentimiento'} de Farmacia Apolo que necesitas firmar una sola vez:\n\n${docList}\n\nEntra a ${link} e inicia sesión (o crea tu cuenta gratis) — ${missingDocs.length === 1 ? 'el documento te aparecerá' : 'los documentos te aparecerán'} automáticamente antes de usar la app.\n\nGracias.`;
};

const AdminConsents = () => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const { toast } = useToast();

  // "Enviar formularios" dialog state
  const [sendOpen, setSendOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const load = () => {
    setLoading(true);
    getAllConsentDocuments()
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openSendDialog = () => {
    setSendOpen(true);
    setSelectedCustomer(null);
    setCustomerSearch('');
    if (customers.length === 0) {
      getCustomers().then(setCustomers).catch(console.error);
    }
  };

  const missingDocsFor = (customerId) => {
    const signed = new Set(
      docs.filter(d => d.customer_id === customerId && d.status === 'signed').map(d => d.type)
    );
    return REQUIRED_DOCS.filter(d => !signed.has(d.type));
  };

  const customerMatches = customers.filter(c => {
    const q = customerSearch.toLowerCase().trim();
    return !q || [c.full_name, c.email, c.phone].some(f => f && String(f).toLowerCase().includes(q));
  }).slice(0, 8);

  const appLink = `${window.location.origin}/customer-app/`;
  const missing = selectedCustomer ? missingDocsFor(selectedCustomer.id) : [];
  const message = selectedCustomer ? buildSendMessage(selectedCustomer, missing, appLink) : '';

  const handleWhatsApp = () => {
    const phone = normalizePhoneForWhatsApp(selectedCustomer?.phone);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleEmail = () => {
    const subject = 'Documentos de consentimiento — Farmacia Apolo';
    window.location.href = `mailto:${selectedCustomer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast({ title: 'Mensaje copiado', description: 'Pégalo en WhatsApp, SMS o correo.' });
    } catch {
      toast({ title: 'No se pudo copiar el mensaje', variant: 'destructive' });
    }
  };

  const filtered = docs.filter(d => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q || [
      d.customers?.full_name, d.customers?.email, d.title, d.type, d.signer_name,
    ].some(field => field && String(field).toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const countBy = (status) => docs.filter(d => d.status === status).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Consentimientos</h2>
          <p className="text-slate-600">Documentos de consentimiento informado firmados y pendientes de todos los clientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Actualizar</Button>
          <Button size="sm" onClick={openSendDialog}><Send className="w-4 h-4 mr-2" />Enviar formularios</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Firmados', value: countBy('signed'), color: 'from-green-500 to-emerald-600' },
          { label: 'Pendientes', value: countBy('pending'), color: 'from-yellow-500 to-amber-600' },
          { label: 'Rechazados', value: countBy('declined'), color: 'from-red-500 to-rose-600' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`bg-gradient-to-br ${s.color} rounded-xl shadow-lg p-6 text-white`}>
            <FileSignature className="w-8 h-8 mb-2" />
            <p className="text-sm opacity-90">{s.label}</p>
            <p className="text-3xl font-bold">{s.value}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input placeholder="Buscar por cliente, documento o firmante..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-1.5">
            {STATUS_FILTERS.map(f => (
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
        </div>

        {loading ? (
          <p className="text-center text-slate-500 py-8">Cargando consentimientos...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No hay documentos que coincidan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Documento</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 font-medium">Firmante</th>
                  <th className="pb-3 font-medium">Fecha de firma</th>
                  <th className="pb-3 font-medium">Creado</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const badge = STATUS_BADGES[d.status] || { label: d.status, color: 'bg-slate-100 text-slate-600' };
                  const expanded = expandedId === d.id;
                  return (
                    <React.Fragment key={d.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : d.id)}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-800">{d.customers?.full_name || '—'}</p>
                          <p className="text-xs text-slate-500">{d.customers?.email || ''}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="text-slate-800">{d.title}</p>
                          <p className="text-xs text-slate-500">{d.type}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{d.signer_name || '—'}</td>
                        <td className="py-3 pr-4 text-slate-700">{formatDate(d.signed_at)}</td>
                        <td className="py-3 pr-4 text-slate-500">{formatDate(d.created_at)}</td>
                        <td className="py-3 text-slate-400">
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={7} className="p-4">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Contenido del documento</p>
                            <div className="max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg p-4 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                              {d.content}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Enviar formularios de consentimiento</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">
            El cliente abre el enlace, inicia sesión (o crea su cuenta) y los documentos le aparecen automáticamente antes de usar la app.
          </p>

          {!selectedCustomer ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input className="pl-10" placeholder="Buscar cliente por nombre, correo o teléfono..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
                {customerMatches.length === 0 ? (
                  <p className="text-sm text-slate-500 p-3">Sin coincidencias.</p>
                ) : customerMatches.map(c => {
                  const missingCount = missingDocsFor(c.id).length;
                  return (
                    <button key={c.id} onClick={() => setSelectedCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.full_name}</p>
                        <p className="text-xs text-slate-500 truncate">{c.phone || c.email || '—'}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${missingCount === 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {missingCount === 0 ? 'Al corriente' : `Faltan ${missingCount}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{selectedCustomer.full_name}</p>
                  <p className="text-xs text-slate-500">{selectedCustomer.phone || selectedCustomer.email || 'Sin contacto registrado'}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedCustomer(null)}>Cambiar</Button>
              </div>

              <div className="space-y-1.5">
                {REQUIRED_DOCS.map(d => {
                  const signed = !missing.some(m => m.type === d.type);
                  return (
                    <div key={d.type} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{d.title}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${signed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {signed ? 'Firmado' : 'Falta'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {missing.length === 0 ? (
                <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3">Este cliente ya firmó todos los documentos — no hace falta enviar nada.</p>
              ) : (
                <>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-40 overflow-y-auto">{message}</div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={handleWhatsApp} disabled={!selectedCustomer.phone} className="bg-green-600 hover:bg-green-700 text-white">
                      <MessageCircle className="w-4 h-4 mr-1.5" />WhatsApp
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleEmail} disabled={!selectedCustomer.email}>
                      <Mail className="w-4 h-4 mr-1.5" />Correo
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCopy}>
                      <Copy className="w-4 h-4 mr-1.5" />Copiar mensaje
                    </Button>
                  </div>
                  {!selectedCustomer.phone && (
                    <p className="text-xs text-amber-700">Sin teléfono registrado — usa "Copiar mensaje" o "Correo".</p>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminConsents;
