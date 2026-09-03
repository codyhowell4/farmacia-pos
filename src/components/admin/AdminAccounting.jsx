import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { BookOpen, Plus, Download, Filter, Trash2, Edit2, Loader2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatMXN } from '@/lib/currency';
import { getShifts, getExpenses, createExpense, updateExpense, deleteExpense, getManualRevenue, createManualRevenue, updateManualRevenue, deleteManualRevenue } from '@/lib/db';
import AkauntingConnectionCard from './AkauntingConnectionCard';
import AkauntingSyncPanel from './AkauntingSyncPanel';

const EXPENSE_CATEGORIES = [
  'Office Supplies',
  'Rent',
  'Utilities',
  'Salaries',
  'Inventory',
  'Marketing',
  'Maintenance',
  'Taxes',
  'Insurance',
  'Other',
];

const formatDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
};

const AdminAccounting = () => {
  const [shifts, setShifts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [manualRevenue, setManualRevenue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  });
  const [filterType, setFilterType] = useState('all'); // all, revenue, expense
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSubcategory, setFilterSubcategory] = useState('');
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingRevenue, setEditingRevenue] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    category: 'Office Supplies',
    subcategory: '',
  });
  const [revenueForm, setRevenueForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    subcategory: 'Medicamento',
    total_sales: '',
  });
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [shiftsData, expensesData, manualRevenueData] = await Promise.all([
        getShifts(),
        getExpenses(startDate || null, endDate || null),
        getManualRevenue(startDate || null, endDate || null),
      ]);
      setShifts(shiftsData || []);
      setExpenses(expensesData || []);
      setManualRevenue(manualRevenueData || []);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos contables', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const revenueTransactions = useMemo(() => {
    const shiftRevenue = shifts
      .filter((s) => s.status === 'closed')
      .filter((s) => {
        const d = new Date(s.closed_at || s.opened_at);
        if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
        if (endDate && d > new Date(`${endDate}T23:59:59`)) return false;
        return true;
      })
      .map((s) => ({
        id: `shift-${s.id}`,
        type: 'revenue',
        date: s.closed_at || s.opened_at,
        description: `Cierre De Caja ${s.locations?.name || 'Sucursal'}`,
        amount: s.total_revenue || 0,
        category: 'Revenue',
        subcategory: 'Medicamento',
        totalSales: s.total_sales || 0,
        avgOrder: s.total_sales > 0 ? (s.total_revenue || 0) / s.total_sales : 0,
        raw: s,
        source: 'shift',
      }));

    const manual = manualRevenue.map((r) => ({
      id: `manual-${r.id}`,
      type: 'revenue',
      date: r.date,
      description: r.description,
      amount: r.amount || 0,
      category: 'Revenue',
      subcategory: r.subcategory || 'Medicamento',
      totalSales: r.total_sales,
      avgOrder: r.total_sales > 0 ? (r.amount || 0) / r.total_sales : null,
      raw: r,
      source: 'manual',
    }));

    return [...shiftRevenue, ...manual];
  }, [shifts, manualRevenue, startDate, endDate]);

  const expenseTransactions = useMemo(() => {
    return expenses.map((e) => ({
      id: `expense-${e.id}`,
      type: 'expense',
      date: e.date,
      description: e.description,
      amount: -Math.abs(e.amount),
      category: e.category,
      subcategory: e.subcategory || '',
      totalSales: null,
      avgOrder: null,
      raw: e,
    }));
  }, [expenses]);

  const allTransactions = useMemo(() => {
    let txs = [...revenueTransactions, ...expenseTransactions];
    if (filterType === 'revenue') txs = txs.filter((t) => t.type === 'revenue');
    if (filterType === 'expense') txs = txs.filter((t) => t.type === 'expense');
    if (filterCategory) txs = txs.filter((t) => t.category === filterCategory);
    if (filterSubcategory) txs = txs.filter((t) => (t.subcategory || '').toLowerCase().includes(filterSubcategory.toLowerCase()));
    return txs.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [revenueTransactions, expenseTransactions, filterType, filterCategory, filterSubcategory]);

  const totals = useMemo(() => {
    const revenue = revenueTransactions.reduce((sum, t) => sum + t.amount, 0);
    const expense = expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalSalesCount = revenueTransactions.reduce((sum, t) => sum + (t.totalSales || 0), 0);
    return {
      revenue,
      expense,
      net: revenue - expense,
      totalSalesCount,
      avgOrderValue: totalSalesCount > 0 ? revenue / totalSalesCount : 0,
    };
  }, [revenueTransactions, expenseTransactions]);

  const categories = useMemo(() => {
    const cats = new Set(['Revenue', ...EXPENSE_CATEGORIES]);
    return Array.from(cats).sort();
  }, []);

  const handleOpenExpenseModal = (expense = null) => {
    if (expense) {
      setEditingExpense(expense.raw);
      setExpenseForm({
        date: expense.raw.date,
        description: expense.raw.description,
        amount: Math.abs(expense.raw.amount).toString(),
        category: expense.raw.category,
        subcategory: expense.raw.subcategory || '',
      });
    } else {
      setEditingExpense(null);
      setExpenseForm({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        category: 'Office Supplies',
        subcategory: '',
      });
    }
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    const amount = parseFloat(expenseForm.amount);
    if (!expenseForm.description.trim() || Number.isNaN(amount) || amount <= 0) {
      toast({ title: 'Datos inválidos', description: 'Ingresa una descripción y un monto válido.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: expenseForm.date,
        description: expenseForm.description.trim(),
        amount,
        category: expenseForm.category,
        subcategory: expenseForm.subcategory.trim() || null,
      };

      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
        toast({ title: 'Gasto actualizado' });
      } else {
        await createExpense(payload);
        toast({ title: 'Gasto agregado' });
      }
      setExpenseModalOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: err.message || 'No se pudo guardar el gasto', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (expense) => {
    if (!confirm(`¿Eliminar el gasto "${expense.description}"?`)) return;
    try {
      await deleteExpense(expense.raw.id);
      toast({ title: 'Gasto eliminado' });
      await loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: err.message || 'No se pudo eliminar el gasto', variant: 'destructive' });
    }
  };

  const handleOpenRevenueModal = (revenue = null) => {
    if (revenue && revenue.source === 'manual') {
      setEditingRevenue(revenue.raw);
      setRevenueForm({
        date: revenue.raw.date,
        description: revenue.raw.description,
        amount: (revenue.raw.amount || 0).toString(),
        subcategory: revenue.raw.subcategory || 'Medicamento',
        total_sales: revenue.raw.total_sales?.toString() || '',
      });
    } else {
      setEditingRevenue(null);
      setRevenueForm({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        subcategory: 'Medicamento',
        total_sales: '',
      });
    }
    setRevenueModalOpen(true);
  };

  const handleSaveRevenue = async (e) => {
    e.preventDefault();
    const amount = parseFloat(revenueForm.amount);
    if (!revenueForm.description.trim() || Number.isNaN(amount) || amount <= 0) {
      toast({ title: 'Datos inválidos', description: 'Ingresa una descripción y un monto válido.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: revenueForm.date,
        description: revenueForm.description.trim(),
        amount,
        category: 'Revenue',
        subcategory: revenueForm.subcategory.trim() || 'Medicamento',
        total_sales: revenueForm.total_sales ? parseInt(revenueForm.total_sales, 10) : null,
      };

      if (editingRevenue) {
        await updateManualRevenue(editingRevenue.id, payload);
        toast({ title: 'Ingreso actualizado' });
      } else {
        await createManualRevenue(payload);
        toast({ title: 'Ingreso agregado' });
      }
      setRevenueModalOpen(false);
      await loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: err.message || 'No se pudo guardar el ingreso', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRevenue = async (revenue) => {
    if (revenue.source !== 'manual') return;
    if (!confirm(`¿Eliminar el ingreso "${revenue.description}"?`)) return;
    try {
      await deleteManualRevenue(revenue.raw.id);
      toast({ title: 'Ingreso eliminado' });
      await loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: err.message || 'No se pudo eliminar el ingreso', variant: 'destructive' });
    }
  };

  const handleExportCSV = () => {
    const headers = ['Fecha', 'Transaccion', 'Cantidad', 'Categoria', 'Sub Categoria', 'Total De Ventas', 'Average Order'];
    const rows = allTransactions.map((t) => [
      `"${formatDate(t.date)}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount.toFixed(2),
      `"${t.category}"`,
      `"${t.subcategory || ''}"`,
      t.totalSales ?? '',
      t.avgOrder != null ? t.avgOrder.toFixed(2) : '',
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contabilidad_${startDate || 'inicio'}_${endDate || 'fin'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Helmet>
        <title>Contabilidad - Farmacia</title>
        <meta name="description" content="Contabilidad y reportes financieros" />
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-apolo-navy to-apolo-navy-dark p-2 rounded-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Contabilidad</h2>
              <p className="text-slate-600">Ingresos automáticos y gastos manuales</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />Exportar CSV
            </Button>
            <Button variant="outline" onClick={() => handleOpenRevenueModal()}>
              <Plus className="w-4 h-4 mr-2" />Agregar ingreso
            </Button>
            <Button onClick={() => handleOpenExpenseModal()}>
              <Plus className="w-4 h-4 mr-2" />Agregar gasto
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Ingresos totales
            </div>
            <p className="text-2xl font-bold text-green-600">{formatMXN(totals.revenue)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <TrendingDown className="w-4 h-4 text-red-600" />
              Gastos totales
            </div>
            <p className="text-2xl font-bold text-red-600">{formatMXN(totals.expense)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <DollarSign className="w-4 h-4 text-apolo-navy" />
              Utilidad neta
            </div>
            <p className={`text-2xl font-bold ${totals.net >= 0 ? 'text-[#2E9E5B]' : 'text-red-600'}`}>{formatMXN(totals.net)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <Filter className="w-4 h-4 text-slate-600" />
              Ticket promedio
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatMXN(totals.avgOrderValue)}</p>
            <p className="text-xs text-slate-500">{totals.totalSalesCount} ventas</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Del</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Al</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
              >
                <option value="all">Todos</option>
                <option value="revenue">Ingresos</option>
                <option value="expense">Gastos</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Subcategoría</Label>
              <Input
                placeholder="Filtrar..."
                value={filterSubcategory}
                onChange={(e) => setFilterSubcategory(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Transacción</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Cantidad</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Categoría</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-900">Subcategoría</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900"># Ventas</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-900">Ticket Prom.</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-900 w-20">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : allTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No hay transacciones en este rango.
                    </td>
                  </tr>
                ) : (
                  allTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{t.description}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatMXN(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.category}</td>
                      <td className="px-4 py-3 text-slate-600">{t.subcategory || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{t.totalSales ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{t.avgOrder != null ? formatMXN(t.avgOrder) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {t.type === 'expense' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => handleOpenExpenseModal(t)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteExpense(t)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </>
                          )}
                          {t.type === 'revenue' && t.source === 'manual' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => handleOpenRevenueModal(t)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteRevenue(t)}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Akaunting Integration */}
        <div className="pt-6 border-t border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Integración con Akaunting</h3>
          <AkauntingConnectionCard />
          <AkauntingSyncPanel />
        </div>
      </div>

      {/* Add/Edit Expense Modal */}
      <Dialog open={expenseModalOpen} onOpenChange={setExpenseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Editar gasto' : 'Agregar gasto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveExpense} className="space-y-4">
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="Ej: Chedraui, Renta, Luz..."
                required
              />
            </div>
            <div>
              <Label>Monto (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Subcategoría (opcional)</Label>
              <Input
                value={expenseForm.subcategory}
                onChange={(e) => setExpenseForm({ ...expenseForm, subcategory: e.target.value })}
                placeholder="Ej: Cleaning, Office, etc."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setExpenseModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingExpense ? 'Guardar cambios' : 'Agregar gasto'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Revenue Modal */}
      <Dialog open={revenueModalOpen} onOpenChange={setRevenueModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRevenue ? 'Editar ingreso' : 'Agregar ingreso'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRevenue} className="space-y-4">
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={revenueForm.date}
                onChange={(e) => setRevenueForm({ ...revenueForm, date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input
                value={revenueForm.description}
                onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                placeholder="Ej: Cierre De Caja Manana, Venta del día..."
                required
              />
            </div>
            <div>
              <Label>Monto (MXN)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={revenueForm.amount}
                onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label>Subcategoría</Label>
              <Input
                value={revenueForm.subcategory}
                onChange={(e) => setRevenueForm({ ...revenueForm, subcategory: e.target.value })}
                placeholder="Medicamento"
              />
            </div>
            <div>
              <Label># de ventas (opcional)</Label>
              <Input
                type="number"
                min="0"
                value={revenueForm.total_sales}
                onChange={(e) => setRevenueForm({ ...revenueForm, total_sales: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRevenueModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingRevenue ? 'Guardar cambios' : 'Agregar ingreso'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminAccounting;
