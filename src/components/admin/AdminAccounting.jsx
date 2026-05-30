import React from 'react';
import { Helmet } from 'react-helmet';
import { BookOpen } from 'lucide-react';
import AkauntingConnectionCard from './AkauntingConnectionCard';

const AdminAccounting = () => {
  return (
    <>
      <Helmet>
        <title>Contabilidad - Farmacia</title>
        <meta name="description" content="Integración con Akaunting" />
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Contabilidad</h2>
            <p className="text-slate-600">Integración con Akaunting</p>
          </div>
        </div>

        <AkauntingConnectionCard />

        {/* Placeholder for future sync panel */}
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl">
          <h3 className="font-semibold text-slate-900 mb-2">Sincronización</h3>
          <p className="text-sm text-slate-500">
            La sincronización automática de clientes, productos y ventas estará disponible próximamente.
          </p>
        </div>
      </div>
    </>
  );
};

export default AdminAccounting;
