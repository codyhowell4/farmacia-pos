import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

const LAST_UPDATED = '9 de septiembre de 2026';
const CONTACT_EMAIL = 'citas@apolofarmacia.com.mx';

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
          El titular puede cancelar su membresía en cualquier momento, desde la aplicación de clientes o
          directamente en sucursal, sin penalizaciones.
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
        <p>
          Farmacia Apolo, como responsable del tratamiento de sus datos personales, recaba los siguientes
          datos para operar la membresía: nombre completo, datos de contacto (correo electrónico y
          teléfono) y datos de salud derivados de las consultas médicas y revisiones de laboratorio
          utilizadas con la membresía.
        </p>
        <p>Estos datos se utilizan exclusivamente para:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>La operación y administración de la membresía (altas, pagos, beneficios y renovaciones).</li>
          <li>Recordatorios de citas, renovaciones y beneficios disponibles.</li>
          <li>El expediente clínico y la atención médica del titular y sus integrantes.</li>
        </ul>
        <p>
          Sus datos personales no se venden ni se comparten con terceros con fines comerciales. Solo se
          transmiten cuando es necesario para prestar el servicio (por ejemplo, el procesador de pagos) o
          cuando una autoridad competente lo requiera conforme a la ley.
        </p>
        <p>
          Usted puede ejercer en cualquier momento sus derechos de Acceso, Rectificación, Cancelación y
          Oposición (derechos ARCO), así como revocar su consentimiento, enviando una solicitud al correo{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-apolo-navy underline">
            {CONTACT_EMAIL}
          </a>
          , indicando su nombre completo y el derecho que desea ejercer. Daremos respuesta en los plazos
          que marca la Ley Federal de Protección de Datos Personales en Posesión de los Particulares
          (LFPDPPP).
        </p>
        <p>
          Los datos personales se resguardan conforme a la LFPDPPP. Los datos clínicos se tratan,
          además, bajo secreto profesional y con los lineamientos de la Norma Oficial Mexicana NOM-004
          sobre el expediente clínico.
        </p>
      </Section>

      <p className="text-xs text-slate-500 text-center">
        Farmacia Apolo — Membresías Apolo. Última actualización: {LAST_UPDATED}.
      </p>
    </div>
  </div>
);

export default MembershipTermsPage;
