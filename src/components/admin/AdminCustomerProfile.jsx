import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserCircle, Phone, Mail, MapPin, Calendar, FileText, Pill, Clock, ShoppingCart, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  getCustomerById,
  getCustomerStats,
  getCustomerPrescriptions,
  getCustomerPreorders,
  getCustomerAppointments,
  getCustomerOrders,
} from '@/lib/db';

const StatCard = ({ label, value, icon: Icon, color }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      </div>
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
);

const StatusBadge = ({ status, config }) => {
  const s = config[status] || config.pending || { label: status, className: 'bg-slate-100 text-slate-800' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
};

const prescriptionStatusConfig = {
  pending:    { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  reviewed:   { label: 'Revisada',  className: 'bg-blue-100 text-blue-800' },
  approved:   { label: 'Aprobada',  className: 'bg-green-100 text-green-800' },
  dispensed:  { label: 'Surtida',   className: 'bg-purple-100 text-purple-800' },
  rejected:   { label: 'Rechazada', className: 'bg-red-100 text-red-800' },
};

const preorderStatusConfig = {
  pending:    { label: 'Pendiente',  className: 'bg-yellow-100 text-yellow-800' },
  approved:   { label: 'Aprobado',   className: 'bg-green-100 text-green-800' },
  ready:      { label: 'Listo',      className: 'bg-blue-100 text-blue-800' },
  delivered:  { label: 'Entregado',  className: 'bg-emerald-100 text-emerald-800' },
  completed:  { label: 'Completado', className: 'bg-slate-100 text-slate-800' },
  cancelled:  { label: 'Cancelado',  className: 'bg-red-100 text-red-800' },
};

const appointmentStatusConfig = {
  pending:    { label: 'Pendiente',   className: 'bg-yellow-100 text-yellow-800' },
  confirmed:  { label: 'Confirmada',  className: 'bg-blue-100 text-blue-800' },
  completed:  { label: 'Completada',  className: 'bg-green-100 text-green-800' },
  cancelled:  { label: 'Cancelada',   className: 'bg-red-100 text-red-800' },
};

const AdminCustomerProfile = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [customer, setCustomer] = useState(null);
  const [stats, setStats] = useState({ prescriptions: 0, preorders: 0, appointments: 0, orders: 0 });
  const [prescriptions, setPrescriptions] = useState([]);
  const [preorders, setPreorders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('prescriptions');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [customerId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [cust, st, pres, preo, appts, ords] = await Promise.all([
        getCustomerById(customerId),
        getCustomerStats(customerId),
        getCustomerPrescriptions(customerId),
        getCustomerPreorders(customerId),
        getCustomerAppointments(customerId),
        getCustomerOrders(customerId),
      ]);
      setCustomer(cust);
      setStats(st);
      setPrescriptions(pres);
      setPreorders(preo);
      setAppointments(appts);
      setOrders(ords);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (n) => {
    if (n == null) return '$0.00';
    return `$${parseFloat(n).toFixed(2)}`;
  };

  if (isLoading) {
    return <div className="py-12 text-center text-slate-500">Cargando perfil del cliente...</div>;
  }

  if (!customer) {
    return (
      <div className="py-12 text-center text-slate-500">
        <p className="mb-4">Cliente no encontrado.</p>
        <Button onClick={() => navigate('/admin/customers')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Regresar a clientes
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: 'prescriptions', label: `Recetas (${stats.prescriptions})`, icon: FileText },
    { id: 'preorders', label: `Recargas (${stats.preorders})`, icon: Pill },
    { id: 'appointments', label: `Citas (${stats.appointments})`, icon: Clock },
    { id: 'orders', label: `Pedidos (${stats.orders})`, icon: ShoppingCart },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/customers')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Perfil del cliente</h1>
        </div>
      </div>

      {/* Customer Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xl font-bold">
            {(customer.full_name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900">{customer.full_name || 'Sin nombre'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                {customer.email || '—'}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                {customer.phone || '—'}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400" />
                {customer.address || '—'}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                {customer.date_of_birth ? formatDate(customer.date_of_birth) : '—'}
              </div>
            </div>
            {customer.curp && (
              <div className="mt-3 text-sm text-slate-500 font-mono">CURP: {customer.curp}</div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Recetas médicas" value={stats.prescriptions} icon={FileText} color="bg-amber-500" />
        <StatCard label="Solicitudes de recarga" value={stats.preorders} icon={Pill} color="bg-blue-500" />
        <StatCard label="Citas" value={stats.appointments} icon={Clock} color="bg-purple-500" />
        <StatCard label="Pedidos" value={stats.orders} icon={ShoppingCart} color="bg-emerald-500" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {activeTab === 'prescriptions' && (
            <div className="space-y-3">
              {prescriptions.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">No hay recetas médicas.</p>}
              {prescriptions.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{p.notes || 'Receta médica'}</div>
                      <div className="text-xs text-slate-500">{formatDate(p.created_at)}</div>
                    </div>
                  </div>
                  <StatusBadge status={p.status || 'pending'} config={prescriptionStatusConfig} />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'preorders' && (
            <div className="space-y-3">
              {preorders.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">No hay solicitudes de recarga.</p>}
              {preorders.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <Pill className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{p.inventory?.name || 'Medicamento'}</div>
                      <div className="text-xs text-slate-500">{p.quantity || 1} unidad(es) • {formatDate(p.created_at)}</div>
                    </div>
                  </div>
                  <StatusBadge status={p.status || 'pending'} config={preorderStatusConfig} />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'appointments' && (
            <div className="space-y-3">
              {appointments.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">No hay citas.</p>}
              {appointments.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{a.profiles?.full_name || 'Médico'}</div>
                      <div className="text-xs text-slate-500">
                        {a.appointment_date ? new Date(a.appointment_date).toLocaleString('es-MX') : '—'}
                        {a.notes ? ` • ${a.notes}` : ''}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={a.status || 'pending'} config={appointmentStatusConfig} />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-3">
              {orders.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">No hay pedidos.</p>}
              {orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-sm font-medium text-slate-900">Pedido #{o.id?.slice(0, 8)}</div>
                      <div className="text-xs text-slate-500">
                        {o.sale_items?.length || 0} producto(s) • {formatDate(o.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-900">{formatCurrency(o.total)}</div>
                    <div className="text-xs text-slate-500 capitalize">{o.status || 'processing'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCustomerProfile;
