import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Package, ShoppingCart, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, UserCheck, UserX, Box, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import * as akauntingSync from '@/services/akauntingSync';

const SECTIONS = [
  {
    id: 'customers',
    title: 'Sincronización de clientes',
    description: 'Envía los clientes registrados en Farmacia a Akaunting como contactos',
    icon: Users,
    gradient: 'from-green-500 to-emerald-600',
    buttonLabel: 'Sincronizar clientes',
    syncingLabel: 'Sincronizando clientes...',
    syncFn: 'syncAllCustomers',
    resultLabel: 'clientes',
  },
  {
    id: 'products',
    title: 'Sincronización de productos',
    description: 'Envía el inventario de Farmacia a Akaunting como productos',
    icon: Package,
    gradient: 'from-orange-500 to-amber-600',
    buttonLabel: 'Sincronizar productos',
    syncingLabel: 'Sincronizando productos...',
    syncFn: 'syncAllItems',
    resultLabel: 'productos',
  },
  {
    id: 'sales',
    title: 'Sincronización de ventas',
    description: 'Envía las ventas completadas de Farmacia a Akaunting como facturas',
    icon: ShoppingCart,
    gradient: 'from-purple-500 to-violet-600',
    buttonLabel: 'Sincronizar ventas',
    syncingLabel: 'Sincronizando ventas...',
    syncFn: 'syncAllSales',
    resultLabel: 'ventas',
  },
];

const AkauntingSyncPanel = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});

  const handleSync = async (section) => {
    setLoading((prev) => ({ ...prev, [section.id]: true }));
    setResults((prev) => ({ ...prev, [section.id]: null }));

    try {
      const res = await akauntingSync[section.syncFn]();
      setResults((prev) => ({ ...prev, [section.id]: res }));
      if (res.total > 0 && res.failed === 0) {
        toast({
          title: 'Sincronización completada',
          description: `${res.created} creados, ${res.updated} actualizados de ${res.total} ${section.resultLabel}`,
        });
      }
      // If there are failures, we show them inline in SyncResults instead of a toast
      // to avoid DOM race conditions with Radix Toast + framer-motion
    } catch (e) {
      // Only truly unexpected errors reach here (sync functions now catch their own errors)
      const errorResult = { created: 0, updated: 0, failed: 1, skipped: 0, total: 1, errors: [{ name: 'Error inesperado', error: e.message }] };
      setResults((prev) => ({ ...prev, [section.id]: errorResult }));
      console.error('[AkauntingSyncPanel] unexpected sync error:', e);
    } finally {
      setLoading((prev) => ({ ...prev, [section.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => (
        <SyncSection
          key={section.id}
          section={section}
          isLoading={!!loading[section.id]}
          result={results[section.id]}
          onSync={() => handleSync(section)}
        />
      ))}
    </div>
  );
};

const SyncSection = ({ section, isLoading, result, onSync }) => {
  const Icon = section.icon;
  const [gradientFrom, gradientTo] = section.gradient.replace('from-', '').replace('to-', '').split(' ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg p-6 max-w-2xl space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className={`bg-gradient-to-br ${section.gradient} p-2 rounded-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">{section.title}</h3>
          <p className="text-sm text-slate-500">{section.description}</p>
        </div>
      </div>

      {/* Button */}
      <div>
        <Button
          onClick={onSync}
          disabled={isLoading}
          className={`bg-gradient-to-r ${section.gradient}`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {isLoading ? section.syncingLabel : section.buttonLabel}
        </Button>
      </div>

      {/* Results */}
      {result && <SyncResults result={result} />}
    </motion.div>
  );
};

const SyncResults = ({ result }) => {
  const safeResult = {
    total: result?.total ?? 0,
    created: result?.created ?? 0,
    updated: result?.updated ?? 0,
    failed: result?.failed ?? 0,
    skipped: result?.skipped ?? 0,
    errors: Array.isArray(result?.errors) ? result.errors : [],
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={safeResult.total} icon={Box} variant="blue" />
        <StatCard label="Creados" value={safeResult.created} icon={CheckCircle2} variant="green" />
        <StatCard label="Actualizados" value={safeResult.updated} icon={UserCheck} variant="indigo" />
        <StatCard label="Fallidos" value={safeResult.failed} icon={AlertCircle} variant="red" />
        <StatCard label="Omitidos" value={safeResult.skipped} icon={UserX} variant="slate" />
      </div>

      {safeResult.errors.length > 0 && (
        <div className="bg-red-50 rounded-lg p-4 border border-red-200">
          <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Errores ({safeResult.errors.length})
          </h4>
          <ul className="text-sm text-red-700 space-y-1 max-h-48 overflow-y-auto">
            {safeResult.errors.map((err, i) => (
              <li key={`err-${i}`} className="break-words">
                • <span className="font-medium">{err.name || 'Desconocido'}</span>: {err.error || 'Error sin mensaje'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, variant }) => {
  const styles = {
    blue:   'bg-blue-50   border-blue-200   text-blue-700',
    green:  'bg-green-50  border-green-200  text-green-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    red:    'bg-red-50    border-red-200    text-red-700',
    slate:  'bg-slate-50  border-slate-200  text-slate-700',
  };

  return (
    <div className={`rounded-lg p-3 border text-center ${styles[variant]}`}>
      <Icon className="w-5 h-5 mx-auto mb-1 opacity-80" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
};

export default AkauntingSyncPanel;
