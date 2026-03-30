// Export utilities for CSV and print-to-PDF

export const exportSalesCSV = (sales) => {
  const headers = [
    'Sale ID','Date','Salesperson','Pharmacy','Payment Method','Status',
    'Item Name','Qty','Unit Price','Original Price','Override By',
    'Sale Total','Discount Code','Discount %','Discount Amount'
  ];
  const rows = sales.flatMap(sale =>
    (sale.items || []).map(item => [
      `"${sale.id}"`,
      `"${new Date(sale.timestamp).toLocaleString()}"`,
      `"${sale.salesperson}"`,
      `"${sale.pharmacyLocation}"`,
      `"${sale.paymentMethod || 'cash'}"`,
      `"${sale.voided ? 'Anulada' : 'Completada'}"`,
      `"${item.name}"`,
      item.quantity,
      (item.price || 0).toFixed(2),
      (item.originalPrice || 0).toFixed(2),
      `"${item.overrideBy || ''}"`,
      (sale.total || 0).toFixed(2),
      `"${sale.discount?.code || ''}"`,
      sale.discount?.value || 0,
      (sale.discount?.amount || 0).toFixed(2),
    ].join(','))
  );
  downloadCSV([headers.join(','), ...rows].join('\n'), 'sales_report.csv');
};

export const exportShiftsCSV = (shifts) => {
  const headers = [
    'Shift ID','Opened By','Location','Opened At','Closed At','Duration (min)',
    'Starting Cash','Closing Cash','Expected Cash','Variance',
    'Total Sales','Total Revenue','Cash Sales','Card Sales','Insurance Sales','Notes'
  ];
  const rows = shifts.filter(s => s.status === 'closed').map(s => {
    const durationMs = new Date(s.closedAt) - new Date(s.openedAt);
    const durationMin = Math.round(durationMs / 60000);
    return [
      `"${s.id}"`,
      `"${s.openedBy}"`,
      `"${s.pharmacyLocation}"`,
      `"${new Date(s.openedAt).toLocaleString()}"`,
      `"${new Date(s.closedAt).toLocaleString()}"`,
      durationMin,
      s.startingCash?.toFixed(2),
      s.closingCash?.toFixed(2),
      s.expectedCash?.toFixed(2),
      s.variance?.toFixed(2),
      s.summary?.totalSales || 0,
      (s.summary?.totalRevenue || 0).toFixed(2),
      (s.summary?.totalCash || 0).toFixed(2),
      (s.summary?.totalCard || 0).toFixed(2),
      (s.summary?.totalInsurance || 0).toFixed(2),
      `"${s.notes || ''}"`,
    ].join(',');
  });
  downloadCSV([headers.join(','), ...rows].join('\n'), 'shifts_report.csv');
};

export const exportAuditCSV = (entries) => {
  const headers = ['Fecha y hora','Acción','Usuario','Rol','Ubicación','Detalle'];
  const rows = entries.map(e => [
    `"${new Date(e.timestamp).toLocaleString()}"`,
    `"${e.action}"`,
    `"${e.userName}"`,
    `"${e.userRole || ''}"`,
    `"${e.pharmacyLocation || ''}"`,
    `"${(e.details || '').replace(/"/g, "'")}"`,
  ].join(','));
  downloadCSV([headers.join(','), ...rows].join('\n'), 'audit_log.csv');
};

const downloadCSV = (content, filename) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const printReport = (title, htmlContent) => {
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 24px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p.meta { color: #64748b; margin-bottom: 16px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-size: 11px; border-bottom: 2px solid #e2e8f0; }
        td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        tr:nth-child(even) td { background: #f8fafc; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; }
        .green { background: #dcfce7; color: #166534; }
        .red { background: #fee2e2; color: #991b1b; }
        .blue { background: #dbeafe; color: #1e40af; }
        .purple { background: #f3e8ff; color: #7e22ce; }
        .yellow { background: #fef9c3; color: #92400e; }
        .summary { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
        .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; min-width: 140px; }
        .summary-card p { margin: 0; }
        .summary-card .label { font-size: 10px; color: #64748b; }
        .summary-card .value { font-size: 18px; font-weight: 700; color: #1e293b; }
        @media print { body { margin: 12px; } }
      </style>
    </head>
    <body>
      ${htmlContent}
      <p class="meta" style="margin-top:24px">Generated ${new Date().toLocaleString()}</p>
    </body>
    </html>
  `);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
};
