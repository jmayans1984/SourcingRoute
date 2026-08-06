'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Route } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-soft">
            <Route size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">SourcingRoute</h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Ingresa para planear tu día de sourcing
          </p>
        </div>

        <div className="mt-7 rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Correo"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@ejemplo.com"
              required
              autoComplete="email"
            />
            <Input
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger">{error}</p>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading}>
              Iniciar sesión
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-text-secondary">
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}
