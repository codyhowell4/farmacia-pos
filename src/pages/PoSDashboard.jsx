import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Plus, Minus, Trash2, LogOut, Search, DollarSign, Barcode, Ticket, CreditCard, Stethoscope, XCircle, AlertTriangle, Clock, RotateCcw, Building2, Trash2 as TrashIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useShift } from '@/contexts/ShiftContext';
import CloseShiftModal from '@/components/CloseShiftModal';
import ReceiptModal from '@/components/ReceiptModal';
import PatientModal from '@/components/PatientModal';
import ReturnModal from '@/components/ReturnModal';
import PrescriptionModal from '@/components/PrescriptionModal';
import { logAudit, AUDIT_ACTIONS } from '@/lib/auditLog';
import { formatMXN, getTaxSettings, calcIVA } from '@/lib/currency';
import {
  getInventory, createSale, createSaleWithPayments, getRecentSales, voidSale, findDiscount,
  getTaxSettingsDb, getBankAccounts, createPrescription,
} from '@/lib/db';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Efectivo', icon: DollarSign, color: 'from-green-500 to-emerald-600' },
  { id: 'card', label: 'Tarjeta', icon: CreditCard, color: 'from-blue-500 to-indigo-600' },
  { id: 'transferencia', label: 'Transferencia', icon: Building2, color: 'from-orange-500 to-red-600' },
  { id: 'insurance', label: 'Seguro', icon: Stethoscope, color: 'from-purple-500 to-pink-600' },
];

// Mexican Peso denominations
const PESO_DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

const PoSDashboard = () => {
  const { logout, user, verifyAdminPin } = useAuth();
  const { activeShift } = useShift();
  const shiftOpenedAt = activeShift?.opened_at || activeShift?.openedAt;
  const shiftOpenedDate = shiftOpenedAt ? new Date(shiftOpenedAt) : null;
  const shiftOpenedTime = shiftOpenedDate && !Number.isNaN(shiftOpenedDate.getTime())
    ? shiftOpenedDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
    : null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [displayItems, setDisplayItems] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [view, setView] = useState('main');
  const [amountGiven, setAmountGiven] = useState('');
  const [change, setChange] = useState(0);
  const [discountCode, setDiscountCode] = useState('');
  const [discount, setDiscount] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [splitPayments, setSplitPayments] = useState([]); // [{ method, amount, reference }]
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState(null);
  const [transferenciaReference, setTransferenciaReference] = useState('');
  const [cardReference, setCardReference] = useState('');
  const [isAdminPinOpen, setIsAdminPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [overrideData, setOverrideData] = useState(null);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [voidSaleId, setVoidSaleId] = useState('');
  const [voidPin, setVoidPin] = useState('');
  const [recentSales, setRecentSales] = useState([]);
  const [rxNumbers, setRxNumbers] = useState({}); // { [itemId]: rxNumber }
  const [taxSettings, setTaxSettings] = useState(getTaxSettings());
  const [completedSale, setCompletedSale] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [prescriptionData, setPrescriptionData] = useState(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!user?.locationId) return;
    getInventory(user.locationId).then(items => {
      setInventory(items);
      setDisplayItems(
        items.filter(i => i.quantity > 0)
          .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
          .slice(0, 10)
      );
    }).catch(console.error);
    getTaxSettingsDb().then(setTaxSettings).catch(console.error);
    getBankAccounts().then(accounts => {
      setBankAccounts(accounts);
      const defaultAccount = accounts.find(a => a.is_default);
      if (defaultAccount) setSelectedBankAccount(defaultAccount);
    }).catch(console.error);
    searchInputRef.current?.focus();
  }, [user?.locationId]);

  const loadRecentSales = async () => {
    try {
      const sales = await getRecentSales(user?.locationId, 10);
      setRecentSales(sales);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const addToCart = (medicine, quantity = 1) => {
    const invItem = inventory.find(i => i.id === medicine.id);
    if (!invItem || invItem.quantity <= 0) {
      toast({ title: 'Sin existencias', description: `${medicine.name} no está disponible.`, variant: 'destructive' });
      return;
    }
    const existingItem = cart.find(item => item.id === medicine.id);
    let itemAdded = false;
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity <= invItem.quantity) {
        setCart(cart.map(item => item.id === medicine.id ? { ...item, quantity: newQuantity } : item));
        itemAdded = true;
      } else {
        toast({ title: 'Stock insuficiente', variant: 'destructive' });
      }
    } else {
      if (quantity <= invItem.quantity) {
        setCart([...cart, { ...medicine, quantity, originalPrice: medicine.price, price: medicine.price, overrideBy: null }]);
        itemAdded = true;
      } else {
        toast({ title: 'Stock insuficiente', variant: 'destructive' });
      }
    }
    if (itemAdded) {
      setSearchResults([]); setSearchTerm(''); setIsSearching(false);
      setDisplayItems(inventory.filter(item => item.quantity > 0).sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 10));
      toast({ title: 'Artículo agregado', description: `${medicine.name} agregado al carrito.` });
    }
  };

  const updateQuantity = (id, delta) => {
    setCart(currentCart => currentCart.map(item => {
      if (item.id === id) {
        const newQuantity = item.quantity + delta;
        const inventoryItem = inventory.find(inv => inv.id === id);
        if (newQuantity > 0 && newQuantity <= inventoryItem.quantity) return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
    setRxNumbers(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleSearch = (e, updateGrid = false) => {
    e?.preventDefault();
    const lowerSearchTerm = searchTerm.toLowerCase();
    const results = inventory.filter(item =>
      (item.barcode === searchTerm || item.name.toLowerCase().includes(lowerSearchTerm) || item.use?.toLowerCase().includes(lowerSearchTerm)) && item.quantity > 0
    );
    
    // Barcode scanner auto-add: if exact barcode match and only 1 result, add to cart immediately
    if (results.length === 1 && results[0].barcode === searchTerm) {
      addToCart(results[0]);
      setSearchTerm('');
      setSearchResults([]);
      // Play beep sound for barcode scan success
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmFgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
      audio.play().catch(() => {});
      return;
    }
    
    if (updateGrid) {
      setDisplayItems(results); setIsSearching(true); setSearchResults([]);
    } else {
      if (!searchTerm) { setSearchResults([]); return; }
      setSearchResults(results);
    }
  };

  useEffect(() => {
    if (!searchTerm) {
      setIsSearching(false);
      setDisplayItems(inventory.filter(item => item.quantity > 0).sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 10));
    }
  }, [searchTerm, inventory]);

  const applyDiscount = async () => {
    try {
      const foundDiscount = await findDiscount(discountCode);
      if (foundDiscount) {
        setDiscount(foundDiscount);
        toast({ title: '¡Descuento aplicado!', description: `${foundDiscount.value}% de descuento aplicado` });
      } else {
        toast({ title: 'Código inválido', variant: 'destructive' });
        setDiscount(null);
      }
    } catch {
      toast({ title: 'Código inválido', variant: 'destructive' });
      setDiscount(null);
    }
  };

  const handlePriceChange = (id, newPriceStr) => {
    const newPrice = parseFloat(newPriceStr);
    if (isNaN(newPrice)) return;
    setCart(cart.map(item => item.id === id ? { ...item, price: newPrice } : item));
  };

  const handlePriceBlur = (id) => {
    const item = cart.find(item => item.id === id);
    if (!item || item.price === item.originalPrice) return;
    const discountPercentage = ((item.originalPrice - item.price) / item.originalPrice) * 100;
    if (discountPercentage > 10 || item.price < 0) {
      setOverrideData({ itemId: id, newPrice: item.price });
      setIsAdminPinOpen(true);
      setCart(cart.map(i => i.id === id ? { ...i, price: i.originalPrice } : i));
      toast({ title: 'Se requiere aprobación del administrador', description: 'Este cambio de precio requiere autorización del administrador.' });
    } else {
      setCart(cart.map(i => i.id === id ? { ...i, overrideBy: 'auto-approved' } : i));
    }
  };

  const verifyPinAndOverride = async () => {
    const adminUser = await verifyAdminPin(adminPin);
    if (adminUser) {
      setCart(cart.map(item => item.id === overrideData.itemId ? { ...item, price: overrideData.newPrice, overrideBy: adminUser.name } : item));
      logAudit({ action: AUDIT_ACTIONS.PRICE_OVERRIDE, user, details: `Item overridden to {formatMXN(overrideData.newPrice)} by ${adminUser.name}` });
      setIsAdminPinOpen(false); setAdminPin(''); setOverrideData(null);
      toast({ title: '¡Precio modificado!' });
    } else {
      toast({ title: 'PIN inválido', variant: 'destructive' });
    }
  };

  const handleCheckoutClick = () => {
    // This is called from the checkout screen to finalize the sale
    completeSale(null, prescriptionData);
  };

  const proceedToCheckout = () => {
    const hasRx = cart.some(item => item.requires_prescription);
    if (hasRx) {
      // Show prescription modal FIRST (before going to checkout)
      setPrescriptionModalOpen(true);
    } else {
      // No prescription needed, proceed directly to checkout
      setView('checkout');
    }
  };

  const handlePrescriptionConfirm = (prescription) => {
    setPrescriptionData(prescription);
    // Also update Rx numbers from the prescription form
    if (prescription.rx_item_numbers) {
      setRxNumbers(prescription.rx_item_numbers);
    }
    setPrescriptionModalOpen(false);
    // Now proceed to checkout screen
    setView('checkout');
  };

  const handlePatientConfirm = (patient) => {
    setPatientModalOpen(false);
    setPendingCheckout(false);
    completeSale(patient, prescriptionData);
  };

  const completeSale = async (patient, prescription) => {
    // Build payments array
    let payments = [];
    
    if (isSplitPayment) {
      // Use split payments
      if (splitPayments.length === 0) {
        toast({ title: 'Error', description: 'Agrega al menos un pago', variant: 'destructive' });
        return;
      }
      const totalPaid = splitPayments.reduce((sum, p) => sum + p.amount, 0);
      if (Math.abs(totalPaid - finalTotal) > 0.01) {
        toast({ title: 'Error', description: `El total de pagos (${formatMXN(totalPaid)}) no coincide con el total (${formatMXN(finalTotal)})`, variant: 'destructive' });
        return;
      }
      payments = splitPayments;
    } else {
      // Single payment - build from current state
      let reference = '';
      let bankAccountId = null;
      
      if (paymentMethod === 'transferencia') {
        if (!transferenciaReference.trim()) {
          toast({ title: 'Referencia requerida', description: 'Ingresa el número de referencia de la transferencia', variant: 'destructive' });
          return;
        }
        reference = transferenciaReference;
        bankAccountId = selectedBankAccount?.id;
      } else if (paymentMethod === 'card') {
        if (!cardReference.trim()) {
          toast({ title: 'Autorización requerida', description: 'Ingresa el número de autorización', variant: 'destructive' });
          return;
        }
        reference = cardReference;
      }
      
      if (paymentMethod === 'cash') {
        if (finalTotal > parseFloat(amountGiven || 0)) {
          toast({ title: 'Fondos insuficientes', description: 'El efectivo entregado es menor al total', variant: 'destructive' });
          return;
        }
      }
      
      payments = [{
        payment_method: paymentMethod,
        amount: finalTotal,
        reference_number: reference || null,
        bank_account_id: bankAccountId,
      }];
    }

    const missingRx = cart.filter(item => item.requires_prescription && !rxNumbers[item.id]?.trim());
    if (missingRx.length > 0) {
      toast({ title: 'Número de receta requerido', description: `Ingresa Rx # para: ${missingRx.map(i => i.name).join(', ')}`, variant: 'destructive' });
      return;
    }

    try {
      const cashPayment = payments.find(p => p.payment_method === 'cash');
      
      const saleRecord = {
        location_id: user.locationId,
        org_id: user.orgId,
        salesperson: user.name,
        total: finalTotal,
        payment_method: isSplitPayment ? (payments[0]?.payment_method || 'cash') : paymentMethod,
        amount_given: cashPayment ? cashPayment.amount : null,
        change_due: cashPayment ? (cashPayment.amount - (cashPayment.amountApplied || cashPayment.amount)) : null,
        discount_code: discount?.code || null,
        discount_value: discount?.value || null,
        discount_amount: discountAmount || null,
        iva_enabled: taxSettings.ivaEnabled,
        iva_rate: taxSettings.ivaRate,
        iva_amount: ivaAmount || null,
        patient_name: patient?.name || null,
        patient_curp: patient?.curp || null,
        timestamp: new Date().toISOString(),
        voided: false,
        is_split_payment: isSplitPayment,
      };

      const saleItems = cart.map(item => ({
        inventory_id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        original_price: item.originalPrice,
        override_by: item.overrideBy || null,
        rx_number: rxNumbers[item.id] || null,
      }));

      console.log('Creating sale with record:', saleRecord);
      console.log('Sale items:', saleItems);
      console.log('Payments:', payments);
      
      const sale = await createSaleWithPayments(saleRecord, saleItems, payments);
      
      console.log('Sale created successfully:', sale);

      // Create prescription record if prescription data exists
      if (prescription) {
        try {
          const prescriptionRecord = {
            sale_id: sale.id,
            patient_name: prescription.patient_name,
            patient_curp: prescription.patient_curp,
            doctor_name: prescription.doctor_name,
            doctor_license_number: prescription.doctor_license_number,
            doctor_office_address: prescription.doctor_office_address,
            doctor_phone: prescription.doctor_phone,
            prescription_number: prescription.prescription_number,
            prescription_date: prescription.prescription_date,
          };
          
          const createdPrescription = await createPrescription(prescriptionRecord);
          console.log('Prescription created:', createdPrescription);
          
          logAudit({ 
            action: AUDIT_ACTIONS.PRESCRIPTION_ADDED, 
            user, 
            details: `Prescription #${prescription.prescription_number} for ${prescription.patient_name} - Dr. ${prescription.doctor_name}` 
          });
        } catch (rxErr) {
          console.error('Failed to create prescription:', rxErr);
          // Don't fail the sale if prescription fails, but log it
          toast({ 
            title: 'Advertencia', 
            description: 'La venta se completó pero hubo un error guardando la receta. Contacte al administrador.', 
            variant: 'destructive' 
          });
        }
      }

      logAudit({ action: AUDIT_ACTIONS.SALE_COMPLETE, user, details: `Sale #${sale.id.slice(-6)} | ${formatMXN(finalTotal)} | ${isSplitPayment ? 'split' : paymentMethod} | ${cart.length} item(s)` });
      toast({ title: '¡Venta completada!', description: `${formatMXN(finalTotal)} ${isSplitPayment ? '(pago dividido)' : ''}` });

      // Prepare sale data for receipt
      const saleData = {
        ...sale,
        paymentMethod: saleRecord.payment_method,
        payment_method: saleRecord.payment_method,
        items: saleItems.map(item => ({
          ...item,
          rxNumber: item.rx_number,
          requiresPrescription: cart.find(c => c.id === item.inventory_id)?.requires_prescription
        })),
        payments: payments,
        discount: discount ? { code: discount.code, amount: discountAmount } : null,
        iva: { rate: taxSettings.ivaRate, amount: ivaAmount },
        pharmacyLocation: user?.pharmacyLocation || user?.locationId,
        amountGiven: cashPayment ? (paymentMethod === 'cash' && !isSplitPayment ? parseFloat(amountGiven) : cashPayment.amount) : null,
        changeDue: cashPayment ? ((paymentMethod === 'cash' && !isSplitPayment ? parseFloat(amountGiven) : cashPayment.amount) - finalTotal) : null,
      };

      // Show receipt modal
      setCompletedSale(saleData);
      setReceiptOpen(true);

      // Refresh local inventory from DB
      const updatedInventory = await getInventory(user.locationId);
      setInventory(updatedInventory);
      setDisplayItems(
        updatedInventory.filter(i => i.quantity > 0)
          .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
          .slice(0, 10)
      );

      // Reset cart after a delay
      setTimeout(() => {
        setCart([]); setDiscount(null); setDiscountCode(''); setAmountGiven(''); setChange(0);
        setPaymentMethod('cash'); setView('main'); setRxNumbers({});
        setSplitPayments([]); setIsSplitPayment(false);
        setTransferenciaReference(''); setCardReference('');
        searchInputRef.current?.focus();
      }, 500);
    } catch (e) {
      console.error('Sale error:', e);
      toast({ title: 'Error al procesar venta', description: e.message || 'Error desconocido', variant: 'destructive' });
    }
  };

  const openVoidDialog = () => { loadRecentSales(); setIsVoidOpen(true); };

  const handleVoidSale = async () => {
    const adminUser = await verifyAdminPin(voidPin);
    if (!adminUser) { toast({ title: 'PIN inválido', variant: 'destructive' }); return; }
    if (!voidSaleId) { toast({ title: 'Selecciona una venta a anular', variant: 'destructive' }); return; }

    try {
      await voidSale(voidSaleId, adminUser.full_name || adminUser.name);

      const updatedInventory = await getInventory(user.locationId);
      setInventory(updatedInventory);
      setDisplayItems(
        updatedInventory.filter(i => i.quantity > 0)
          .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
          .slice(0, 10)
      );

      toast({ title: 'Sale Voided', description: `Venta #${voidSaleId.slice(-6)} anulada` });
      logAudit({ action: AUDIT_ACTIONS.SALE_VOID, user, details: `Venta #${voidSaleId.slice(-6)} anulada por ${adminUser.full_name || adminUser.name}` });
      setIsVoidOpen(false); setVoidSaleId(''); setVoidPin('');
    } catch (e) {
      toast({ title: e.message || 'Error al anular', variant: 'destructive' });
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = discount ? subtotal * (discount.value / 100) : 0;
  const subtotalAfterDiscount = subtotal - discountAmount;
  const ivaAmount = calcIVA(subtotalAfterDiscount, taxSettings);
  const finalTotal = subtotalAfterDiscount + ivaAmount;

  useEffect(() => {
    const given = parseFloat(amountGiven);
    if (!isNaN(given)) { setChange(given - finalTotal); } else { setChange(-finalTotal); }
  }, [amountGiven, finalTotal]);

  if (view === 'checkout') {
    const isCash = paymentMethod === 'cash';
    const remainingForSplit = finalTotal - splitPayments.reduce((sum, p) => sum + p.amount, 0);
    
    const addSplitPayment = () => {
      let amount = remainingForSplit;
      let reference = '';
      let bankAccountId = null;
      
      if (paymentMethod === 'transferencia') {
        if (!transferenciaReference.trim()) {
          toast({ title: 'Referencia requerida', description: 'Ingresa el número de referencia de la transferencia', variant: 'destructive' });
          return;
        }
        reference = transferenciaReference;
        bankAccountId = selectedBankAccount?.id;
      } else if (paymentMethod === 'card') {
        if (!cardReference.trim()) {
          toast({ title: 'Autorización requerida', description: 'Ingresa el número de autorización', variant: 'destructive' });
          return;
        }
        reference = cardReference;
      }
      
      if (paymentMethod === 'cash' && parseFloat(amountGiven) > 0) {
        amount = parseFloat(amountGiven);
      }
      
      if (amount <= 0 || amount > remainingForSplit) {
        toast({ title: 'Monto inválido', description: `El monto debe ser entre $1 y ${formatMXN(remainingForSplit)}`, variant: 'destructive' });
        return;
      }
      
      setSplitPayments([...splitPayments, {
        payment_method: paymentMethod,
        amount,
        reference_number: reference,
        bank_account_id: bankAccountId,
      }]);
      
      setAmountGiven('');
      setTransferenciaReference('');
      setCardReference('');
    };
    
    const removeSplitPayment = (index) => {
      setSplitPayments(splitPayments.filter((_, i) => i !== index));
    };
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 p-4 sm:p-8">
        <Helmet><title>Checkout - Pharmacy PoS</title></Helmet>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-4 sm:p-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-center mb-6 sm:mb-8 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Cobrar</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Resumen del pedido</h2>
              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm sm:text-base">
                    <p>{item.name} <span className="text-slate-500">x{item.quantity}</span></p>
                    <p>{formatMXN((item.price * item.quantity))}</p>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-2 text-sm sm:text-base">
                <div className="flex justify-between"><p>Subtotal:</p><p>{formatMXN(subtotal)}</p></div>
                {discount && <div className="flex justify-between text-red-600"><p>Descuento ({discount.value}%):</p><p>-{formatMXN(discountAmount)}</p></div>}
                {taxSettings.ivaEnabled && <div className="flex justify-between text-slate-500"><p>IVA ({taxSettings.ivaRate}%):</p><p>{formatMXN(ivaAmount)}</p></div>}
                <div className="flex justify-between text-lg sm:text-2xl font-bold">
                  <p>Total:</p>
                  <div className="text-right">
                    <p>{formatMXN(finalTotal)}</p>
                    {isSplitPayment && remainingForSplit > 0 && (
                      <p className="text-sm font-normal text-orange-600">Pendiente: {formatMXN(remainingForSplit)}</p>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Split Payments List */}
              {isSplitPayment && splitPayments.length > 0 && (
                <div className="mt-4 bg-slate-50 rounded-lg p-3">
                  <h3 className="font-semibold text-sm mb-2">Pagos agregados:</h3>
                  {splitPayments.map((payment, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm py-1 border-b border-slate-200 last:border-0">
                      <span className="capitalize">{PAYMENT_METHODS.find(m => m.id === payment.payment_method)?.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{formatMXN(payment.amount)}</span>
                        <button onClick={() => removeSplitPayment(idx)} className="text-red-500 hover:text-red-700">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t">
                    <span>Total pagado:</span>
                    <span>{formatMXN(splitPayments.reduce((sum, p) => sum + p.amount, 0))}</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-4">Pago</h2>
              <div className="space-y-4">
                {/* Split Payment Toggle */}
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                  <Label className="cursor-pointer">Pago dividido</Label>
                  <button
                    onClick={() => {
                      setIsSplitPayment(!isSplitPayment);
                      if (isSplitPayment) {
                        setSplitPayments([]);
                      }
                    }}
                    className={`relative flex items-center w-14 h-7 rounded-full transition-colors ${isSplitPayment ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${isSplitPayment ? 'translate-x-8' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Payment Method */}
                <div>
                  <Label className="mb-2 block">{isSplitPayment ? 'Agregar pago:' : 'Método de pago'}</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {PAYMENT_METHODS.map(m => {
                      const Icon = m.icon;
                      return (
                        <button key={m.id} onClick={() => { setPaymentMethod(m.id); setAmountGiven(''); }}
                          className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all ${paymentMethod === m.id ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <Icon className={`w-4 h-4 mb-1 ${paymentMethod === m.id ? 'text-green-600' : 'text-slate-500'}`} />
                          <span className={`text-xs font-medium ${paymentMethod === m.id ? 'text-green-700' : 'text-slate-600'}`}>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cash Payment */}
                {paymentMethod === 'cash' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <Label>Monto en efectivo</Label>
                    <Input type="number" placeholder="0.00" value={amountGiven} onChange={e => setAmountGiven(e.target.value)} />
                    <div className="grid grid-cols-5 gap-2">
                      {PESO_DENOMINATIONS.slice(0, 5).map(val => (
                        <Button key={val} variant="outline" size="sm" onClick={() => setAmountGiven((parseFloat(amountGiven || 0) + val).toString())}>+${val}</Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {PESO_DENOMINATIONS.slice(5).map(val => (
                        <Button key={val} variant="outline" size="sm" onClick={() => setAmountGiven((parseFloat(amountGiven || 0) + val).toString())}>+${val}</Button>
                      ))}
                    </div>
                    {isSplitPayment && (
                      <Button onClick={addSplitPayment} className="w-full" variant="outline">Agregar pago en efectivo</Button>
                    )}
                    {!isSplitPayment && (
                      <div className={`text-center text-3xl font-bold p-4 rounded-lg ${change < 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                        <p className="text-sm font-normal">{change < 0 ? 'Monto pendiente' : 'Cambio'}</p>
                        <p>{formatMXN(Math.abs(change))}</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Card Payment */}
                {paymentMethod === 'card' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <Label>Número de autorización</Label>
                    <Input 
                      placeholder="Ingresa número de autorización" 
                      value={cardReference}
                      onChange={e => setCardReference(e.target.value)}
                    />
                    <p className="text-sm text-slate-500">Monto a pagar: {formatMXN(isSplitPayment ? remainingForSplit : finalTotal)}</p>
                    {isSplitPayment && (
                      <Button onClick={addSplitPayment} className="w-full" variant="outline">Agregar pago con tarjeta</Button>
                    )}
                  </motion.div>
                )}

                {/* Transferencia Payment */}
                {paymentMethod === 'transferencia' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    {bankAccounts.length > 0 ? (
                      <>
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                          <p className="font-semibold text-orange-800 mb-2">Datos para transferencia:</p>
                          <select 
                            className="w-full p-2 border rounded mb-3"
                            value={selectedBankAccount?.id || ''}
                            onChange={e => setSelectedBankAccount(bankAccounts.find(a => a.id === e.target.value))}
                          >
                            {bankAccounts.map(account => (
                              <option key={account.id} value={account.id}>
                                {account.bank_name} - {account.account_number.slice(-4)}
                              </option>
                            ))}
                          </select>
                          {selectedBankAccount && (
                            <div className="text-sm space-y-1">
                              <p><strong>Banco:</strong> {selectedBankAccount.bank_name}</p>
                              <p><strong>Cuenta:</strong> {selectedBankAccount.account_number}</p>
                              {selectedBankAccount.clabe && <p><strong>CLABE:</strong> {selectedBankAccount.clabe}</p>}
                              {selectedBankAccount.account_holder && <p><strong>Titular:</strong> {selectedBankAccount.account_holder}</p>}
                            </div>
                          )}
                        </div>
                        <Label>Número de referencia de la transferencia</Label>
                        <Input 
                          placeholder="Ingresa número de referencia" 
                          value={transferenciaReference}
                          onChange={e => setTransferenciaReference(e.target.value)}
                        />
                        <p className="text-sm text-slate-500">Monto a transferir: {formatMXN(isSplitPayment ? remainingForSplit : finalTotal)}</p>
                        {isSplitPayment && (
                          <Button onClick={addSplitPayment} className="w-full" variant="outline">Agregar pago por transferencia</Button>
                        )}
                      </>
                    ) : (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                        <p className="text-red-700">No hay cuentas bancarias configuradas</p>
                        <p className="text-sm text-red-600">Contacta al administrador para configurar transferencias</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Insurance Payment */}
                {paymentMethod === 'insurance' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-blue-700 font-medium">Enviar reclamación al seguro por</p>
                    <p className="text-3xl font-bold text-blue-800 mt-1">{formatMXN(isSplitPayment ? remainingForSplit : finalTotal)}</p>
                    {isSplitPayment && (
                      <Button onClick={addSplitPayment} className="w-full mt-3" variant="outline">Agregar pago por seguro</Button>
                    )}
                  </motion.div>
                )}

                {/* Rx Number Inputs - Show if any items require prescription */}
                {cart.some(item => item.requires_prescription) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <p className="font-semibold text-blue-800 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4" />
                      Números de receta requeridos
                    </p>
                    {cart.filter(item => item.requires_prescription).map(item => (
                      <div key={item.id} className="space-y-1">
                        <Label className="text-sm text-blue-700">{item.name}</Label>
                        <Input
                          placeholder="Ingresa número de receta (Rx #)"
                          value={rxNumbers[item.id] || ''}
                          onChange={e => setRxNumbers(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className={!rxNumbers[item.id]?.trim() ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}
                        />
                        {!rxNumbers[item.id]?.trim() && (
                          <p className="text-xs text-red-600">Este medicamento requiere número de receta</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Button onClick={handleCheckoutClick} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-lg py-6">Finalizar venta</Button>
                <Button onClick={() => setView('main')} variant="outline" className="w-full">Volver al carrito</Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Punto de Venta - Farmacia</title></Helmet>
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50">
        <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-2 rounded-lg"><ShoppingCart className="w-6 h-6 text-white" /></div>
                <div><h1 className="text-lg sm:text-xl font-bold text-slate-900">Punto de Venta</h1><p className="text-xs text-slate-500">Vendedor: {user?.name}</p></div>
              </div>
              <form onSubmit={(e) => handleSearch(e, true)} className="flex-1 max-w-sm sm:max-w-xl mx-4 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input ref={searchInputRef} placeholder="Buscar o escanear código de barras..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); handleSearch(e); }} className="pl-10 pr-10" />
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                    {searchResults.map(item => (
                      <div key={item.id} className="p-3 hover:bg-slate-100 cursor-pointer flex justify-between items-center" onClick={() => addToCart(item)}>
                        <p>{item.name} <span className="text-slate-500">({item.use})</span></p>
                        <p className="font-bold text-green-600">{formatMXN(item.price)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </form>
              <div className="flex items-center gap-2">
                {activeShift && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Turno abierto desde {shiftOpenedTime || 'hora no disponible'}
                  </span>
                )}
                <Button onClick={() => setReturnOpen(true)} variant="outline" size="sm" className="hidden sm:inline-flex text-orange-600 border-orange-200 hover:bg-orange-50">
                  <RotateCcw className="w-4 h-4 mr-2" />Devolución
                </Button>
                <Button onClick={openVoidDialog} variant="outline" size="sm" className="hidden sm:inline-flex text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4 mr-2" />Anular venta
                </Button>
                <Button onClick={() => setCloseShiftOpen(true)} variant="outline" size="sm" className="hidden sm:inline-flex text-orange-600 border-orange-200 hover:bg-orange-50">
                  <Clock className="w-4 h-4 mr-2" />Close Shift
                </Button>
                {user?.role === 'admin' && (
                  <Button onClick={() => navigate('/admin')} variant="outline" size="sm" className="hidden sm:inline-flex text-blue-600 border-blue-200 hover:bg-blue-50">
                    ← Admin
                  </Button>
                )}
                <Button onClick={handleLogout} variant="outline" size="sm" className="hidden sm:inline-flex"><LogOut className="w-4 h-4 mr-2" />Logout</Button>
                <Button onClick={handleLogout} variant="ghost" size="icon" className="sm:hidden"><LogOut className="w-5 h-5" /></Button>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="lg:col-span-8 xl:col-span-9 mb-6 lg:mb-0">
              <h2 className="text-lg sm:text-xl font-bold mb-4">{isSearching ? 'Resultados de búsqueda' : 'Artículos más vendidos'}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {displayItems.map((medicine) => (
                  <motion.div key={medicine.id} whileHover={{ scale: 1.03 }} className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4 hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between" onClick={() => addToCart(medicine)}>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <h3 className="font-semibold text-slate-900 truncate text-sm sm:text-base">{medicine.name}</h3>
                        {medicine.requires_prescription && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 flex-shrink-0">Rx</span>}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 truncate">{medicine.use}</p>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-base sm:text-lg font-bold text-green-600">{formatMXN(medicine.price)}</span>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Stock: {medicine.quantity}</span>
                    </div>
                  </motion.div>
                ))}
                {isSearching && displayItems.length === 0 && <p className="col-span-full text-center text-slate-500 py-8">Ningún artículo coincide con tu búsqueda.</p>}
                {!isSearching && displayItems.length === 0 && <p className="col-span-full text-center text-slate-500 py-8">Sin artículos en existencia.</p>}
              </div>
            </motion.div>

            <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="lg:col-span-4 xl:col-span-3 bg-white rounded-xl shadow-2xl p-4 sm:p-6 h-fit lg:sticky lg:top-24">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 flex items-center"><ShoppingCart className="w-6 h-6 mr-2" />Carrito</h2>
              <div className="space-y-3 max-h-[40vh] lg:max-h-[calc(100vh-380px)] overflow-y-auto mb-4 pr-2">
                {cart.map((item) => (
                  <div key={item.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium text-sm">{item.name}</span>
                        {item.requires_prescription && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">Rx</span>
                        )}
                        {item.overrideBy && <p className="text-xs text-blue-600">Overridden by {item.overrideBy}</p>}
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => updateQuantity(item.id, -1)} className="bg-slate-100 hover:bg-slate-200 rounded p-1"><Minus className="w-4 h-4" /></button>
                        <span className="font-semibold w-6 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="bg-slate-100 hover:bg-slate-200 rounded p-1"><Plus className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm mr-1">$</span>
                        <Input type="number" value={item.price} onChange={e => handlePriceChange(item.id, e.target.value)} onBlur={() => handlePriceBlur(item.id)} className="w-20 h-8 text-right font-bold text-green-600" />
                      </div>
                    </div>
                    {item.requires_prescription && (
                      <div className="mt-2">
                        <Input
                          placeholder="Rx # (required)"
                          value={rxNumbers[item.id] || ''}
                          onChange={e => setRxNumbers(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className={`h-7 text-xs ${!rxNumbers[item.id]?.trim() ? 'border-blue-300 bg-blue-50' : 'border-green-300'}`}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {cart.length === 0 && <p className="text-slate-500 text-center py-8">Tu carrito está vacío</p>}
              </div>
              <div className="border-t border-slate-200 pt-4 space-y-4">
                <div className="flex space-x-2">
                  <Input placeholder="Código de descuento" value={discountCode} onChange={e => setDiscountCode(e.target.value)} />
                  <Button onClick={applyDiscount} variant="outline" size="icon"><Ticket className="w-4 h-4" /></Button>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><p>Subtotal:</p><p>{formatMXN(subtotal)}</p></div>
                  {discount && <div className="flex justify-between text-red-600"><p>Descuento ({discount.value}%):</p><p>-{formatMXN(discountAmount)}</p></div>}
                  {taxSettings.ivaEnabled && <div className="flex justify-between text-slate-500 text-sm"><p>IVA ({taxSettings.ivaRate}%):</p><p>{formatMXN(ivaAmount)}</p></div>}
                </div>
                <div className="flex justify-between items-center text-xl sm:text-2xl font-bold"><p>Total:</p><p className="text-green-600">{formatMXN(finalTotal)}</p></div>
                <Button onClick={proceedToCheckout} disabled={cart.length === 0} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-lg py-6"><DollarSign className="w-5 h-5 mr-2" />Ir a cobrar</Button>
              </div>
            </motion.div>
          </div>
        </main>
      </div>

      {/* Admin PIN for price override */}
      <Dialog open={isAdminPinOpen} onOpenChange={setIsAdminPinOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Autorización de administrador requerida</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p>Este cambio de precio requiere aprobación del administrador.</p>
            <Label htmlFor="admin-pin">PIN de administrador</Label>
            <Input id="admin-pin" type="password" value={adminPin} onChange={e => setAdminPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && verifyPinAndOverride()} />
            <Button onClick={verifyPinAndOverride} className="w-full">Autorizar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Void Sale Dialog */}
      <Dialog open={isVoidOpen} onOpenChange={(open) => { setIsVoidOpen(open); if (!open) { setVoidSaleId(''); setVoidPin(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Anular una venta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Seleccionar venta a anular</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {recentSales.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No se encontraron ventas recientes</p>}
                {recentSales.map(sale => (
                  <button key={sale.id} onClick={() => setVoidSaleId(sale.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${voidSaleId === sale.id ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">#{sale.id.slice(-6)} &middot; {sale.salesperson}</p>
                        <p className="text-xs text-slate-500">{new Date(sale.timestamp).toLocaleString()}</p>
                      </div>
                      <p className="font-bold text-green-600">{formatMXN(sale.total)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>PIN de administrador para autorizar</Label>
              <Input type="password" placeholder="Ingresa el PIN de administrador" value={voidPin} onChange={e => setVoidPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleVoidSale()} />
            </div>
            <Button onClick={handleVoidSale} variant="destructive" className="w-full" disabled={!voidSaleId || !voidPin}>
              <XCircle className="w-4 h-4 mr-2" />Void Selected Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <CloseShiftModal open={closeShiftOpen} onOpenChange={setCloseShiftOpen} />
      <ReceiptModal open={receiptOpen} onOpenChange={setReceiptOpen} sale={completedSale} />
      <PatientModal open={patientModalOpen} onOpenChange={setPatientModalOpen} onConfirm={handlePatientConfirm} />
      <PrescriptionModal 
        open={prescriptionModalOpen} 
        onOpenChange={setPrescriptionModalOpen}
        cart={cart}
        onConfirm={handlePrescriptionConfirm}
        finalTotal={finalTotal}
        paymentMethod={paymentMethod}
      />
      <ReturnModal open={returnOpen} onOpenChange={setReturnOpen} onReturnComplete={async () => {
        const updatedInventory = await getInventory(user?.locationId);
        setInventory(updatedInventory);
        setDisplayItems(
          updatedInventory.filter(i => i.quantity > 0)
            .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
            .slice(0, 10)
        );
      }} />
    </>
  );
};

export default PoSDashboard;
