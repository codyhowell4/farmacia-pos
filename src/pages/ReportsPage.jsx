import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, FileDown, AlertTriangle, Package, Pill, Activity } from 'lucide-react';
import { 
  getControlledSubstancesSales, 
  getInventoryMovement, 
  getExpiringItems, 
  getExpiredItems,
  exportToCSV,
  downloadCSV,
  formatReportDate,
  formatReportDateTime,
} from '../services/reportsService';
import { toast } from 'sonner';

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState({});
  const [data, setData] = useState({
    controlled: [],
    movement: [],
    expiring: [],
    expired: [],
  });

  // Load expiring items on mount
  useEffect(() => {
    loadExpiringItems();
    loadExpiredItems();
  }, []);

  const loadControlled = async () => {
    setLoading(prev => ({ ...prev, controlled: true }));
    try {
      const sales = await getControlledSubstancesSales(startDate, endDate);
      setData(prev => ({ ...prev, controlled: sales }));
    } catch (err) {
      toast.error('Error loading controlled substances report');
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, controlled: false }));
    }
  };

  const loadMovement = async () => {
    setLoading(prev => ({ ...prev, movement: true }));
    try {
      const movements = await getInventoryMovement(startDate, endDate);
      setData(prev => ({ ...prev, movement: movements }));
    } catch (err) {
      toast.error('Error loading inventory movement report');
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, movement: false }));
    }
  };

  const loadExpiringItems = async () => {
    setLoading(prev => ({ ...prev, expiring: true }));
    try {
      const items = await getExpiringItems(90);
      setData(prev => ({ ...prev, expiring: items }));
    } catch (err) {
      toast.error('Error loading expiring items');
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, expiring: false }));
    }
  };

  const loadExpiredItems = async () => {
    setLoading(prev => ({ ...prev, expired: true }));
    try {
      const items = await getExpiredItems();
      setData(prev => ({ ...prev, expired: items }));
    } catch (err) {
      toast.error('Error loading expired items');
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, expired: false }));
    }
  };

  const handleExportControlled = () => {
    if (data.controlled.length === 0) {
      toast.info('No data to export');
      return;
    }
    const headers = [
      { key: 'sale_date', label: 'Fecha Venta' },
      { key: 'patient_name', label: 'Paciente' },
      { key: 'patient_curp', label: 'CURP' },
      { key: 'doctor_name', label: 'Médico' },
      { key: 'doctor_license_number', label: 'Cédula Profesional' },
      { key: 'prescription_number', label: 'Folio Receta' },
      { key: 'prescription_date', label: 'Fecha Receta' },
      { key: 'medication_name', label: 'Medicamento' },
      { key: 'quantity', label: 'Cantidad' },
      { key: 'rx_number', label: 'Número de Control' },
      { key: 'total', label: 'Total' },
    ];
    const csv = exportToCSV(data.controlled, headers);
    downloadCSV(csv, `controlados_${startDate}_${endDate}`);
    toast.success('Reporte exportado');
  };

  const handleExportMovement = () => {
    if (data.movement.length === 0) {
      toast.info('No data to export');
      return;
    }
    const headers = [
      { key: 'created_at', label: 'Fecha' },
      { key: 'medication_name', label: 'Medicamento' },
      { key: 'previous_quantity', label: 'Cantidad Anterior' },
      { key: 'new_quantity', label: 'Cantidad Nueva' },
      { key: 'change', label: 'Cambio' },
      { key: 'reason', label: 'Motivo' },
      { key: 'adjusted_by_name', label: 'Realizado por' },
    ];
    const csv = exportToCSV(data.movement, headers);
    downloadCSV(csv, `movimiento_${startDate}_${endDate}`);
    toast.success('Reporte exportado');
  };

  const handleExportExpiring = () => {
    if (data.expiring.length === 0) {
      toast.info('No data to export');
      return;
    }
    const headers = [
      { key: 'name', label: 'Medicamento' },
      { key: 'batch_number', label: 'Lote' },
      { key: 'expiration_date', label: 'Caducidad' },
      { key: 'quantity', label: 'Existencia' },
      { key: 'status', label: 'Estado' },
      { key: 'days_until_expiry', label: 'Días Restantes' },
    ];
    const csv = exportToCSV(data.expiring, headers);
    downloadCSV(csv, `caducidad_${today}`);
    toast.success('Reporte exportado');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'EXPIRED':
        return <Badge variant="destructive">CADUCADO</Badge>;
      case 'CRITICAL':
        return <Badge variant="destructive" className="bg-red-500">CRÍTICO</Badge>;
      case 'WARNING':
        return <Badge variant="warning" className="bg-yellow-500 text-black">ADVERTENCIA</Badge>;
      default:
        return <Badge variant="success" className="bg-green-500">BUENO</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <FileDown className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Reportes COFEPRIS</h1>
      </div>

      {/* Date Range Selector */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Rango de Fechas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label>Desde</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-2">
            <Label>Hasta</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadControlled}>
              <Pill className="h-4 w-4 mr-2" />
              Cargar Controlados
            </Button>
            <Button variant="outline" onClick={loadMovement}>
              <Activity className="h-4 w-4 mr-2" />
              Cargar Movimientos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="controlled" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="controlled" className="flex items-center gap-2">
            <Pill className="h-4 w-4" />
            Sustancias Controladas
            {data.controlled.length > 0 && (
              <Badge variant="secondary" className="ml-1">{data.controlled.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="movement" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Movimientos Inventario
            {data.movement.length > 0 && (
              <Badge variant="secondary" className="ml-1">{data.movement.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="expiring" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Caducidad
            {data.expiring.length > 0 && (
              <Badge variant="secondary" className="ml-1">{data.expiring.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Controlled Substances Tab */}
        <TabsContent value="controlled">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Pill className="h-5 w-5 text-purple-600" />
                Reporte de Sustancias Controladas
              </CardTitle>
              <Button 
                onClick={handleExportControlled}
                disabled={data.controlled.length === 0}
                variant="outline"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              {loading.controlled ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : data.controlled.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Pill className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Seleccione un rango de fechas y haga clic en "Cargar Controlados"</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Paciente</th>
                        <th className="px-3 py-2 text-left">Médico</th>
                        <th className="px-3 py-2 text-left">Cédula</th>
                        <th className="px-3 py-2 text-left">Receta</th>
                        <th className="px-3 py-2 text-left">Medicamento</th>
                        <th className="px-3 py-2 text-center">Cant</th>
                        <th className="px-3 py-2 text-left">Control</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.controlled.map((item, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatReportDate(item.sale_date)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.patient_name}</div>
                            {item.patient_curp && (
                              <div className="text-xs text-gray-500">{item.patient_curp}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">{item.doctor_name}</td>
                          <td className="px-3 py-2 font-mono text-xs">{item.doctor_license_number}</td>
                          <td className="px-3 py-2">
                            <div className="text-xs">{item.prescription_number}</div>
                            <div className="text-xs text-gray-500">
                              {formatReportDate(item.prescription_date)}
                            </div>
                          </td>
                          <td className="px-3 py-2">{item.medication_name}</td>
                          <td className="px-3 py-2 text-center font-medium">{item.quantity}</td>
                          <td className="px-3 py-2 font-mono text-xs">{item.rx_number || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Movement Tab */}
        <TabsContent value="movement">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Movimientos de Inventario
              </CardTitle>
              <Button 
                onClick={handleExportMovement}
                disabled={data.movement.length === 0}
                variant="outline"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              {loading.movement ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : data.movement.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Seleccione un rango de fechas y haga clic en "Cargar Movimientos"</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Medicamento</th>
                        <th className="px-3 py-2 text-center">Anterior</th>
                        <th className="px-3 py-2 text-center">Nuevo</th>
                        <th className="px-3 py-2 text-center">Cambio</th>
                        <th className="px-3 py-2 text-left">Motivo</th>
                        <th className="px-3 py-2 text-left">Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movement.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatReportDateTime(item.created_at)}
                          </td>
                          <td className="px-3 py-2 font-medium">{item.medication_name}</td>
                          <td className="px-3 py-2 text-center">{item.previous_quantity}</td>
                          <td className="px-3 py-2 text-center">{item.new_quantity}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-bold ${item.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.change > 0 ? '+' : ''}{item.change}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">{item.reason}</td>
                          <td className="px-3 py-2 text-gray-500">{item.adjusted_by_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expiration Tracking Tab */}
        <TabsContent value="expiring">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Seguimiento de Caducidad
              </CardTitle>
              <Button 
                onClick={handleExportExpiring}
                disabled={data.expiring.length === 0}
                variant="outline"
              >
                <FileDown className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              {loading.expiring ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : data.expiring.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No hay productos próximos a caducar</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Medicamento</th>
                        <th className="px-3 py-2 text-left">Lote</th>
                        <th className="px-3 py-2 text-left">Caducidad</th>
                        <th className="px-3 py-2 text-center">Existencia</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-center">Días</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expiring.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{item.name}</td>
                          <td className="px-3 py-2 font-mono text-xs">{item.batch_number || '-'}</td>
                          <td className="px-3 py-2">{formatReportDate(item.expiration_date)}</td>
                          <td className="px-3 py-2 text-center">{item.quantity}</td>
                          <td className="px-3 py-2 text-center">{getStatusBadge(item.status)}</td>
                          <td className="px-3 py-2 text-center">
                            {item.status === 'EXPIRED' ? (
                              <span className="text-red-600 font-bold">CADUCADO</span>
                            ) : (
                              <span className={`font-medium ${item.days_until_expiry <= 30 ? 'text-red-600' : 'text-yellow-600'}`}>
                                {item.days_until_expiry} días
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
