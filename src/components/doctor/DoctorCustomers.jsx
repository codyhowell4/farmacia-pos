import { useState, useEffect } from 'react';
import { Users, Search, ChevronRight, ShoppingCart, FileText, Phone, Mail, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getCustomersForDoctor, getCustomerPurchaseHistory, getCustomerMedicalNoteCount } from '@/lib/db';
import { formatMXN } from '@/lib/currency';
import { toast } from 'sonner';

const DoctorCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [noteCount, setNoteCount] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeHistory = Array.isArray(purchaseHistory) ? purchaseHistory : [];

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(safeCustomers);
      return;
    }
    setFiltered(safeCustomers.filter(c =>
      c?.full_name?.toLowerCase().includes(q) ||
      c?.phone?.toLowerCase().includes(q) ||
      c?.email?.toLowerCase().includes(q) ||
      c?.curp?.toLowerCase().includes(q)
    ));
  }, [search, safeCustomers.length]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await getCustomersForDoctor();
      const safe = Array.isArray(data) ? data : [];
      setCustomers(safe);
      setFiltered(safe);
    } catch (err) {
      toast.error('Error cargando pacientes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (customer) => {
    if (!customer?.id) return;
    setSelectedCustomer(customer);
    setDetailLoading(true);
    try {
      const [history, notes] = await Promise.all([
        getCustomerPurchaseHistory(customer.id),
        getCustomerMedicalNoteCount(customer.id),
      ]);
      setPurchaseHistory(Array.isArray(history) ? history : []);
      setNoteCount(typeof notes === 'number' ? notes : 0);
    } catch (err) {
      toast.error('Error cargando detalles del paciente');
      console.error(err);
      setPurchaseHistory([]);
      setNoteCount(0);
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pacientes</h2>
          <p className="text-slate-600">Consulta y gestiona tus pacientes</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nombre, teléfono, CURP..."
          className="pl-10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {search ? 'No se encontraron pacientes' : 'No hay pacientes registrados'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="divide-y">
            {filtered.map(c => (
              <button
                key={c?.id || Math.random()}
                onClick={() => openDetail(c)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{c?.full_name || 'Sin nombre'}</p>
                  <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                    {c?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                    {c?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600" />
              {selectedCustomer?.full_name || 'Paciente'}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Patient Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                {selectedCustomer?.phone && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {selectedCustomer.phone}
                  </div>
                )}
                {selectedCustomer?.email && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Mail className="w-4 h-4 text-slate-400" />
                    {selectedCustomer.email}
                  </div>
                )}
                {selectedCustomer?.address && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {selectedCustomer.address}
                  </div>
                )}
                {selectedCustomer?.date_of_birth && (
                  <div className="text-sm text-slate-700">
                    <span className="text-slate-500">Nacimiento:</span> {formatDate(selectedCustomer.date_of_birth)}
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span>{noteCount} nota{noteCount !== 1 ? 's' : ''} médica{noteCount !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Purchase History */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  Historial de compras
                </h4>
                {safeHistory.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">Sin compras registradas</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {safeHistory.map(sale => (
                      <div key={sale?.id || Math.random()} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                        <div>
                          <p className="font-medium text-slate-900">{formatDate(sale?.timestamp)}</p>
                          <p className="text-slate-500">{sale?.sale_items?.length || 0} producto(s)</p>
                        </div>
                        <Badge variant="outline" className="font-mono">
                          {formatMXN(sale?.total)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorCustomers;
