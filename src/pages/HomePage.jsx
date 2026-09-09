import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { User, Users, CheckCircle, MapPin } from 'lucide-react';

const HomePage = () => {
    return (
        <div className="min-h-screen bg-apolo-bg flex flex-col">
            <main className="flex-1 py-12 px-4">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="text-center space-y-3">
                        <h1 className="text-4xl font-bold text-slate-900">Farmacia Apolo</h1>
                        <p className="text-lg text-slate-600">
                            Cuida de tu salud y la de tu familia con beneficios todos los meses.
                        </p>
                        <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                            <MapPin className="w-4 h-4" /> Válido en todas nuestras ubicaciones
                        </div>
                    </div>

                    <Card className="transition-all hover:shadow-xl">
                        <CardHeader>
                            <CardTitle className="text-2xl">Membresías Apolo</CardTitle>
                            <CardDescription>
                                Consultas médicas, descuentos y revisiones de laboratorio por una cuota mensual.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                                        <User className="w-5 h-5" /> Plan Individual
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="text-xl font-bold text-slate-900">$150</span> / mes — 2 consultas mensuales.
                                    </p>
                                </div>
                                <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                                        <Users className="w-5 h-5" /> Plan Familiar
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        <span className="text-xl font-bold text-slate-900">$500</span> / mes — titular + hasta 5 integrantes, 8 consultas compartidas.
                                    </p>
                                </div>
                            </div>
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-700">
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                    50% en consultas adicionales
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                    10% de descuento en toda la tienda
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                    Toma de presión gratis
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                    Revisión de laboratorio gratis cada 6 pagos
                                </li>
                            </ul>
                            <Button asChild size="lg" className="w-full sm:w-auto">
                                <Link to="/membresias">Conocer los planes e inscribirme</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </main>

            <footer className="border-t border-apolo-border bg-white py-6 px-4">
                <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
                    <p>Farmacia Apolo</p>
                    <nav className="flex items-center gap-4">
                        <Link to="/membresias" className="text-apolo-navy hover:text-apolo-navy-dark">
                            Membresías Apolo
                        </Link>
                        <Link to="/membresias/terminos" className="text-apolo-navy hover:text-apolo-navy-dark">
                            Términos y Condiciones
                        </Link>
                        <a href="/customer-app/" className="text-apolo-navy hover:text-apolo-navy-dark">
                            Portal de clientes
                        </a>
                        <Link to="/login" className="text-slate-400 hover:text-slate-600">
                            Acceso personal
                        </Link>
                    </nav>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
