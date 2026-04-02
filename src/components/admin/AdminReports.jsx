import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Calendar, FileDown, TrendingUp, TrendingDown, Package, 
  DollarSign, ShoppingCart, AlertCircle, Clock, Users 
} from 'lucide-react';
import { 
  getDailySalesSummary, 
  getTopProducts, 
  getDeadStock, 
  getInventoryValuation,
  getProfitReport,
  getShiftReport,
  closeShift,
  closeAllOpenShifts,
  formatCurrency,
  formatNumber,
} from '../../services/dashboardReportsService';
import { exportToCSV, downloadCSV } from '../../services/reportsService';
import { toast } from 'sonner';

export default function AdminReports() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState({});
  const [data, setData] = useState({
    sales: [],
    topProducts: [],
    deadStock: [],
    valuation: [],
    profit: [],
    shifts: [],
  });

  useEffect(() => {
    loadOverviewData();
  }, []);

  const loadOverviewData = async () => {
    setLoading(prev => ({ ...prev, overview: true }));
    try {
      const [top, dead, valuation, shifts] = await Promise.all([
        getTopProducts(10),
        getDeadStock(),
        getInventoryValuation(),
        getShiftReport(),
      ]);
      setData(prev => ({ ...prev, topProducts: top, deadStock: dead, valuation, shifts }));
    } catch (err) {
      toast.error('Error loading overview data');
    } finally {
      setLoading(prev => ({ ...prev, overview: false }));
    }
  };

  const loadSales = async () => {
    setLoading(prev => ({ ...prev, sales: true }));
    try {
      const sales = await getDailySalesSummary(startDate, endDate);
      setData(prev => ({ ...prev, sales }));
    } catch (err) {
      toast.error('Error loading sales report');
    } finally {
      setLoading(prev => ({ ...prev, sales: false }));
    }
  };

  const loadProfit = async () => {
    setLoading(prev => ({ ...prev, profit: true }));
    try {
      const profit = await getProfitReport(startDate, endDate);
      setData(prev => ({ ...prev, profit }));
    } catch (err) {
      toast.error('Error loading profit report');
    } finally {
      setLoading(prev => ({ ...prev, profit: false }));
    }
  };

  const handleCloseShift = async (shiftId, currentCash) => {
    try {
      await closeShift(shiftId, currentCash);
      toast.success('Turno cerrado exitosamente');
      loadOverviewData();
    } catch (err) {
      toast.error('Error al cerrar turno: ' + err.message);
    }
  };

  const handleCloseAllShifts = async () => {
    if (!confirm('¿Está seguro de cerrar TODOS los turnos abiertos?')) return;
    try {
      const closed = await closeAllOpenShifts();
      toast.success(`${closed.length} turnos cerrados`);
      loadOverviewData();
    } catch (err) {
      toast.error('Error al cerrar turnos: ' + err.message);
    }
  };

  const handleExport = (type, data, headers, filename) => {
    if (data.length === 0) {
      toast.info('No hay datos para exportar');
      return;
    }
    const csv = exportToCSV(data, headers);
    downloadCSV(csv, filename);
    toast.success('Reporte exportado');
  };

  // Calculate summary stats
  const totalRevenue = data.sales.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  const totalTransactions = data.sales.reduce((sum, s) => sum + (s.total_sales || 0), 0);
  const totalInventoryValue = data.valuation.reduce((sum, v) => sum + (v.total_retail_value || 0), 0);
  const openShifts = data.shifts.filter(s => s.status === 'open');
  const deadStockValue = data.deadStock.reduce((sum, item) => sum + (item.inventory_value || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Reportes Administrativos</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ventas (últimos 30 días)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <div className="text-sm text-gray-500">{formatNumber(totalTransactions)} transacciones</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor de Inventario</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInventoryValue)}</div>
            <div className="text-sm text-gray-500">
              {data.valuation.reduce((sum, v) => sum + v.item_count, 0)} productos
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stock Muerto</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(deadStockValue)}</div>
            <div className="text-sm text-gray-500">{data.deadStock.length} productos sin rotación</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Turnos Abiertos</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-2xl font-bold">{openShifts.length}</div>
            {openShifts.length > 0 && (
              <Button size="sm" variant="destructive" onClick={handleCloseAllShifts}>
                Cerrar Todos
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Date Range */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Rango de Fechas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label>Desde</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-2">
            <Label>Hasta</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadSales}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Cargar Ventas
            </Button>
            <Button variant="outline" onClick={loadProfit}>
              <TrendingUp className="h-4 w-4 mr-2" />
              Cargar Ganancias
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="sales">Ventas Diarias</TabsTrigger>
          <TabsTrigger value="profit">Ganancias</TabsTrigger>
          <TabsTrigger value="products">Top Productos</TabsTrigger>
          <TabsTrigger value="inventory">Inventario</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Top 10 Productos Más Vendidos (30 días)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading.overview ? (
                <Skeleton className="h-48 w-full" />
              ) : data.topProducts.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No hay datos disponibles</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        
                        <th className="px-3 py-2 text-center">Unidades</th>
                        <th className="px-3 py-2 text-right">Ingresos</th>
                        <th className="px-3 py-2 text-center">Veces Vendido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((product) => (
                        <tr key={product.inventory_id} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{product.name}</td>
                          
                          <td className="px-3 py-2 text-center">{product.total_quantity_sold}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(product.total_revenue)}</td>
                          <td className="px-3 py-2 text-center">{product.times_sold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dead Stock Alert */}
          {data.deadStock.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-orange-700">
                  <AlertCircle className="h-5 w-5" />
                  Stock Muerto ({data.deadStock.length} productos)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-orange-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-center">Stock</th>
                        <th className="px-3 py-2 text-left">Última Venta</th>
                        <th className="px-3 py-2 text-center">Días Sin Venta</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.deadStock.slice(0, 5).map((item) => (
                        <tr key={item.id} className="border-b hover:bg-orange-50/50">
                          <td className="px-3 py-2 font-medium">{item.name}</td>
                          <td className="px-3 py-2 text-center">{item.current_stock}</td>
                          <td className="px-3 py-2">
                            {item.last_sale_date 
                              ? new Date(item.last_sale_date).toLocaleDateString('es-MX')
                              : 'Nunca vendido'
                            }
                          </td>
                          <td className="px-3 py-2 text-center">
                            {item.days_since_last_sale || '∞'}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.inventory_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Open Shifts */}
          {openShifts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Turnos Abiertos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Cajero</th>
                        <th className="px-3 py-2 text-left">Inicio</th>
                        <th className="px-3 py-2 text-center">Efectivo Inicial</th>
                        <th className="px-3 py-2 text-center"># Ventas</th>
                        <th className="px-3 py-2 text-center">Total</th>
                        <th className="px-3 py-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openShifts.map((shift) => (
                        <tr key={shift.id} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2">{shift.cashier_name}</td>
                          <td className="px-3 py-2">{new Date(shift.start_time).toLocaleString('es-MX')}</td>
                          <td className="px-3 py-2 text-center">{formatCurrency(shift.initial_cash)}</td>
                          <td className="px-3 py-2 text-center">{shift.total_sales || 0}</td>
                          <td className="px-3 py-2 text-center">{formatCurrency(shift.total_revenue)}</td>
                          <td className="px-3 py-2 text-center">
                            <Button 
                              size="sm" 
                              onClick={() => handleCloseShift(shift.id, shift.initial_cash)}
                            >
                              Cerrar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Daily Sales Tab */}
        <TabsContent value="sales">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Reporte de Ventas Diarias</CardTitle>
              <Button 
                variant="outline" 
                onClick={() => handleExport('sales', data.sales, [
                  { key: 'date', label: 'Fecha' },
                  { key: 'total_sales', label: 'Ventas' },
                  { key: 'total_revenue', label: 'Ingresos' },
                  { key: 'total_discounts', label: 'Descuentos' },
                  { key: 'unique_sellers', label: 'Vendedores' },
                ], `ventas_${startDate}_${endDate}`)}
                disabled={data.sales.length === 0}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </CardHeader>
            <CardContent>
              {loading.sales ? (
                <Skeleton className="h-48 w-full" />
              ) : data.sales.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Seleccione fechas y haga clic en "Cargar Ventas"</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-center"># Ventas</th>
                        <th className="px-3 py-2 text-right">Ingresos</th>
                        <th className="px-3 py-2 text-right">Descuentos</th>
                        <th className="px-3 py-2 text-right">Impuestos</th>
                        <th className="px-3 py-2 text-left">Vendedores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.map((sale) => (
                        <tr key={sale.date} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2">{new Date(sale.date).toLocaleDateString('es-MX')}</td>
                          <td className="px-3 py-2 text-center">{sale.total_sales}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(sale.total_revenue)}</td>
                          <td className="px-3 py-2 text-right text-red-600">{formatCurrency(sale.total_discounts)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(sale.total_tax)}</td>
                          <td className="px-3 py-2 text-xs">{sale.sellers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profit Tab */}
        <TabsContent value="profit">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Reporte de Ganancias</CardTitle>
              <Button 
                variant="outline" 
                onClick={() => handleExport('profit', data.profit, [
                  { key: 'date', label: 'Fecha' },
                  { key: 'total_sales', label: 'Ventas' },
                  { key: 'gross_revenue', label: 'Ingresos' },
                  { key: 'cost_of_goods', label: 'Costo' },
                  { key: 'gross_profit', label: 'Ganancia' },
                  { key: 'profit_margin_percent', label: 'Margen %' },
                ], `ganancias_${startDate}_${endDate}`)}
                disabled={data.profit.length === 0}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </CardHeader>
            <CardContent>
              {loading.profit ? (
                <Skeleton className="h-48 w-full" />
              ) : data.profit.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Seleccione fechas y haga clic en "Cargar Ganancias"</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-center">Ventas</th>
                        <th className="px-3 py-2 text-right">Ingresos</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                        <th className="px-3 py-2 text-right">Ganancia</th>
                        <th className="px-3 py-2 text-right">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.profit.map((row) => (
                        <tr key={row.date} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2">{new Date(row.date).toLocaleDateString('es-MX')}</td>
                          <td className="px-3 py-2 text-center">{row.total_sales}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.gross_revenue)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.cost_of_goods)}</td>
                          <td className="px-3 py-2 text-right font-medium text-green-600">
                            {formatCurrency(row.gross_profit)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Badge variant={row.profit_margin_percent > 20 ? 'success' : 'warning'}>
                              {row.profit_margin_percent}%
                            </Badge>
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

        {/* Products Tab */}
        <TabsContent value="products">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top Productos</CardTitle>
              <Button 
                variant="outline" 
                onClick={() => handleExport('products', data.topProducts, [
                  { key: 'name', label: 'Producto' },

                  { key: 'total_quantity_sold', label: 'Unidades' },
                  { key: 'total_revenue', label: 'Ingresos' },
                  { key: 'times_sold', label: 'Veces Vendido' },
                  { key: 'avg_selling_price', label: 'Precio Promedio' },
                ], 'top_productos')}
                disabled={data.topProducts.length === 0}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </CardHeader>
            <CardContent>
              {loading.overview ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Producto</th>
                        
                        <th className="px-3 py-2 text-center">Unidades</th>
                        <th className="px-3 py-2 text-right">Ingresos</th>
                        <th className="px-3 py-2 text-center">Veces Vendido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((product) => (
                        <tr key={product.inventory_id} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{product.name}</td>
                          
                          <td className="px-3 py-2 text-center">{product.total_quantity_sold}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(product.total_revenue)}</td>
                          <td className="px-3 py-2 text-center">{product.times_sold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory">
          <div className="space-y-4">
            {/* Valuation */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Valoración por Categoría</CardTitle>
                <Button 
                  variant="outline" 
                  onClick={() => handleExport('valuation', data.valuation, [
  
                    { key: 'item_count', label: 'Productos' },
                    { key: 'total_units', label: 'Unidades' },
                    { key: 'total_cost_value', label: 'Valor Costo' },
                    { key: 'total_retail_value', label: 'Valor Venta' },
                    { key: 'potential_profit', label: 'Ganancia Potencial' },
                  ], 'valoracion_inventario')}
                  disabled={data.valuation.length === 0}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </CardHeader>
              <CardContent>
                {loading.overview ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          
                          <th className="px-3 py-2 text-center">Productos</th>
                          <th className="px-3 py-2 text-center">Unidades</th>
                          <th className="px-3 py-2 text-right">Valor Costo</th>
                          <th className="px-3 py-2 text-right">Valor Venta</th>
                          <th className="px-3 py-2 text-right">Ganancia Pot.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.valuation.map((cat) => (
                          <tr key={cat.category} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{cat.category}</td>
                            <td className="px-3 py-2 text-center">{cat.item_count}</td>
                            <td className="px-3 py-2 text-center">{cat.total_units}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(cat.total_cost_value)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(cat.total_retail_value)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{formatCurrency(cat.potential_profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dead Stock */}
            <Card className="border-orange-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-orange-700">Stock Muerto (90+ días sin venta)</CardTitle>
                <Button 
                  variant="outline" 
                  onClick={() => handleExport('deadstock', data.deadStock, [
                    { key: 'name', label: 'Producto' },
  
                    { key: 'current_stock', label: 'Stock' },
                    { key: 'last_sale_date', label: 'Última Venta' },
                    { key: 'days_since_last_sale', label: 'Días' },
                    { key: 'inventory_value', label: 'Valor' },
                  ], 'stock_muerto')}
                  disabled={data.deadStock.length === 0}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </CardHeader>
              <CardContent>
                {loading.overview ? (
                  <Skeleton className="h-32 w-full" />
                ) : data.deadStock.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No hay stock muerto</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-orange-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-center">Stock</th>
                          <th className="px-3 py-2 text-left">Última Venta</th>
                          <th className="px-3 py-2 text-center">Días</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.deadStock.map((item) => (
                          <tr key={item.id} className="border-b hover:bg-orange-50/50">
                            <td className="px-3 py-2 font-medium">{item.name}</td>
                            <td className="px-3 py-2 text-center">{item.current_stock}</td>
                            <td className="px-3 py-2">
                              {item.last_sale_date 
                                ? new Date(item.last_sale_date).toLocaleDateString('es-MX')
                                : 'Nunca'
                              }
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={item.days_since_last_sale > 180 ? 'destructive' : 'warning'}>
                                {item.days_since_last_sale || '∞'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.inventory_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
