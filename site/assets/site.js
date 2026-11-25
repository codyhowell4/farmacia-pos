// Farmacia Apolo — sitio público: formulario "Plan Empresa".
// Envía a la edge function empresa-lead (guarda el lead + correo por Resend).
(function () {
  'use strict';
  var cfg = window.APOLO_SITE || {};

  function setStatus(el, msg, ok) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? '#2F7D55' : '#B42318';
    el.style.fontWeight = '700';
  }

  function init(form) {
    var status = form.querySelector('[data-form-status]');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var f = form.elements;
      var data = {
        org_id: cfg.orgId,
        name: f.name.value.trim(),
        company: f.company.value.trim(),
        phone: f.phone.value.trim(),
        email: f.email.value.trim(),
        employees: f.employees.value.trim(),
        website: f.website ? f.website.value : '',
        source_page: location.pathname,
      };
      if (!data.name || !data.company || !data.email || !data.employees) {
        setStatus(status, 'Completa nombre, empresa, correo y número de empleados.', false);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
        setStatus(status, 'Revisa tu correo electrónico.', false);
        return;
      }
      if (!(parseInt(data.employees, 10) > 0)) {
        setStatus(status, 'Indica el número de empleados.', false);
        return;
      }
      button.disabled = true;
      var label = button.textContent;
      button.textContent = 'Enviando…';
      setStatus(status, '', true);
      fetch(cfg.supabaseUrl + '/functions/v1/empresa-lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
        },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (json) {
            if (!res.ok) throw new Error(json.error || 'No pudimos enviar tu solicitud. Inténtalo más tarde.');
            return json;
          });
        })
        .then(function () {
          form.reset();
          setStatus(status, '¡Gracias! Recibimos tu solicitud. Te contactaremos muy pronto con un plan a la medida.', true);
        })
        .catch(function (err) {
          setStatus(status, err.message || 'No pudimos enviar tu solicitud. Inténtalo más tarde.', false);
        })
        .then(function () {
          button.disabled = false;
          button.textContent = label;
        });
    });
  }

  var forms = document.querySelectorAll('[data-empresa-form]');
  for (var i = 0; i < forms.length; i++) init(forms[i]);
})();
