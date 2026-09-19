import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { PRIVACIDAD_TEXT } from '@/lib/consentTexts';

const LAST_UPDATED = '9 de septiembre de 2026';
const CONTACT_EMAIL = 'citas@apolofarmacia.com.mx';
const CONTACT_PHONE = '+52 1 442 548 8893';
const CONTACT_PHONE_TEL = 'tel:+5214425488893';
const BUSINESS_ADDRESS = 'Cometa 4, San Antonio Zomeyucan, 53750 Naucalpan de Juárez, Estado de México, México';

const Section = ({ title, children }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-xl">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
      {children}
    </CardContent>
  </Card>
);

const MembershipTermsPage = () => (
  <div className="min-h-screen bg-apolo-bg py-12 px-4">
    <div className="max-w-3xl mx-auto space-y-8">
      <Link
        to="/membresias"
        className="inline-flex items-center gap-2 text-sm text-apolo-navy hover:text-apolo-navy-dark"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a Membresías Apolo
      </Link>

      <div className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
          Términos y Condiciones — Membresías Apolo
        </h1>
        <p className="text-sm text-slate-500">Última actualización: {LAST_UPDATED}</p>
        <p className="text-sm text-slate-600">
          Al contratar una membresía de Farmacia Apolo ("Membresías Apolo"), el titular acepta los
          presentes Términos y Condiciones y el Aviso de Privacidad aquí incluido. Farmacia Apolo puede
          actualizar este documento; cualquier cambio se notificará con anticipación por correo
          electrónico o en sucursal antes de entrar en vigor.
        </p>
      </div>

      <Section title="Identidad del responsable">
        <p>
          <strong>Farmacia Apolo</strong>, con domicilio en {BUSINESS_ADDRESS}, es el responsable del
          servicio Membresías Apolo y del tratamiento de sus datos personales.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Teléfono:{' '}
            <a href={CONTACT_PHONE_TEL} className="text-apolo-navy underline">
              {CONTACT_PHONE}
            </a>
          </li>
          <li>
            Correo electrónico:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-apolo-navy underline">
              {CONTACT_EMAIL}
            </a>
          </li>
        </ul>
      </Section>

      <Section title="1. Términos del servicio">
        <p>Membresías Apolo ofrece dos planes con vigencia mensual:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Plan Individual ($150 MXN/mes):</strong> 2 consultas médicas mensuales en consultorio
            o por telemedicina.
          </li>
          <li>
            <strong>Plan Familiar ($500 MXN/mes):</strong> titular más hasta 5 integrantes adicionales,
            con 8 consultas médicas mensuales compartidas entre todos los integrantes.
          </li>
        </ul>
        <p>Ambos planes incluyen:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>50% de descuento en consultas adicionales una vez agotadas las consultas del mes.</li>
          <li>10% de descuento en toda la tienda.</li>
          <li>Toma de presión arterial gratis, sin cita ni límite.</li>
          <li>
            Revisión de laboratorio gratis por cada 6 pagos mensuales acumulados: Biometría Hemática y
            Examen General de Orina (más consulta) en el pago 6; Química Sanguínea de 12 elementos (más
            consulta) en el pago 12; y así sucesivamente de forma alternada.
          </li>
        </ul>
        <p>
          Las revisiones de laboratorio son un beneficio en especie y no son canjeables por dinero en
          efectivo ni por otros productos. Las consultas no utilizadas no se acumulan al mes siguiente.
        </p>
        <p>
          Los beneficios de la membresía son personales e intransferibles: solo pueden usarlos el titular
          y, en el Plan Familiar, los integrantes registrados en la membresía.
        </p>
      </Section>

      <Section title="2. Integrantes del plan familiar">
        <p>
          El Plan Familiar admite hasta 5 integrantes adicionales al titular. No es obligatorio
          registrarlos al contratar: pueden agregarse después en sucursal.
        </p>
        <p>
          Los cambios de integrantes (agregar o quitar personas) pueden realizarse una vez cada 90 días
          por membresía. Las correcciones de nombre de un integrante ya registrado no tienen esta
          restricción y pueden hacerse en cualquier momento en sucursal.
        </p>
      </Section>

      <Section title="3. Pagos y renovación">
        <p>
          La membresía se paga por mes anticipado, ya sea mediante cargo mensual automático con PayPal o
          en efectivo en cualquiera de nuestras sucursales. La membresía se renueva cada mes mientras los
          pagos estén al corriente.
        </p>
        <p>
          Si un pago falla o no se realiza en la fecha de renovación, la membresía se pausa de manera
          automática y los beneficios quedan suspendidos hasta que el pago se regularice. Al regularizar,
          los beneficios se restablecen de inmediato.
        </p>
      </Section>

      <Section title="4. Cancelación">
        <p>
          El titular puede cancelar su membresía en cualquier momento, desde la aplicación de clientes,
          por teléfono al{' '}
          <a href={CONTACT_PHONE_TEL} className="text-apolo-navy underline">
            {CONTACT_PHONE}
          </a>{' '}
          o directamente en sucursal, sin penalizaciones.
        </p>
        <p>
          La cancelación es efectiva al final del periodo mensual ya pagado: la membresía permanece
          activa con todos sus beneficios hasta esa fecha. No se otorgan reembolsos parciales por los
          días restantes del periodo en curso.
        </p>
        <p>
          Si más adelante el cliente decide reactivar su membresía, se conserva su historial de pagos
          acumulados para efectos de las revisiones de laboratorio de los pagos 6, 12, 18 y subsecuentes.
        </p>
      </Section>

      <Section title="5. Telemedicina">
        <p>
          Las consultas por video o llamada son un servicio de orientación médica general y no sustituyen
          la atención de urgencias ni la consulta presencial cuando esta sea necesaria.
        </p>
        <p>
          En caso de una emergencia médica, llame de inmediato al 911 o acuda al hospital más cercano; no
          utilice la telemedicina para situaciones que pongan en riesgo la vida.
        </p>
        <p>
          El médico tratante decide, con base en su criterio clínico, si la consulta por telemedicina es
          adecuada para el padecimiento y si procede o no la emisión de una receta.
        </p>
      </Section>

      <Section title="6. Privacidad y datos personales (Aviso de Privacidad)">
        {/* Canonical aviso de privacidad — the single source of truth lives in
            public/customer-app/js/consentDocs.js, mirrored by
            src/lib/consentTexts.js. Do not fork the text here. */}
        <p className="whitespace-pre-wrap">{PRIVACIDAD_TEXT}</p>
      </Section>

      <p className="text-xs text-slate-500 text-center">
        Farmacia Apolo — Membresías Apolo. Última actualización: {LAST_UPDATED}.
      </p>
    </div>
  </div>
);

export default MembershipTermsPage;
