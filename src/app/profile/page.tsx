'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardTitle, IconChip } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeSwitcher } from '@/components/ui/theme-toggle';
import { toast } from '@/components/ui/toast';
import { CustomChainsInput } from '@/components/route/custom-chains-input';
import { LocationInput } from '@/components/route/location-input';
import type { UserProfile } from '@/types/database';
import { Save, LogOut, FileSpreadsheet, Wallet, Plus, X, Palette } from 'lucide-react';

interface ExpenseCategory {
  id: string;
  name: string;
}

const SUGGESTED_CATEGORIES = ['Gasolina', 'Peajes', 'Hotel', 'Alimentación', 'Parqueadero', 'Otros'];

export default function ProfilePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    full_name: '',
    home_address: '',
    home_lat: null,
    home_lng: null,
    default_radius_miles: 30,
    default_store_duration_minutes: 40,
    preferred_chains: [],
  });
  const [googleSheetId, setGoogleSheetId] = useState('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: cats } = await supabase
      .from('expense_categories')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name');
    if (cats) setCategories(cats);

    const { data: existing } = await supabase
      .from('users_profile')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      setProfile(existing);
      // google_sheet_id lives outside UserProfile type — stored in the same row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGoogleSheetId((existing as any).google_sheet_id || '');
    } else {
      setProfile((prev) => ({
        ...prev,
        full_name: user.user_metadata?.full_name || '',
      }));
    }
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const profileData = {
      user_id: user.id,
      full_name: profile.full_name,
      home_address: profile.home_address,
      home_lat: profile.home_lat,
      home_lng: profile.home_lng,
      default_radius_miles: profile.default_radius_miles,
      default_store_duration_minutes: profile.default_store_duration_minutes,
      preferred_chains: profile.preferred_chains,
      google_sheet_id: googleSheetId.trim() || null,
    };

    if (profile.id) {
      await supabase.from('users_profile').update(profileData).eq('id', profile.id);
    } else {
      await supabase.from('users_profile').insert(profileData);
    }

    setSaving(false);
    toast.success('Perfil guardado');
  }

  async function addCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewCategory('');
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('expense_categories')
      .insert({ user_id: user.id, name: trimmed })
      .select('id, name')
      .single();

    if (data) {
      setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Cuenta "${trimmed}" creada`);
    }
    setNewCategory('');
  }

  async function removeCategory(catId: string) {
    const supabase = createClient();
    await supabase.from('expense_categories').delete().eq('id', catId);
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    toast.info('Cuenta eliminada');
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <AppShell>
      <Header title="Perfil" />

      <div className="space-y-4 p-4 md:mx-auto md:max-w-2xl md:p-0">
        {/* Appearance */}
        <Card>
          <div className="flex items-center gap-2">
            <IconChip tone="primary">
              <Palette size={16} />
            </IconChip>
            <CardTitle>Apariencia</CardTitle>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Elige cómo se ve la app. El modo oscuro es más cómodo de noche.
          </p>
          <div className="mt-3">
            <ThemeSwitcher />
          </div>
        </Card>

        <Card>
          <CardTitle>Información Personal</CardTitle>
          <div className="mt-3 space-y-3">
            <Input
              label="Nombre completo"
              value={profile.full_name || ''}
              onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
              placeholder="Tu nombre"
            />
            <LocationInput
              label="Dirección de casa"
              value={profile.home_address || ''}
              onChange={(val, lat, lng) =>
                setProfile((p) => ({
                  ...p,
                  home_address: val,
                  home_lat: lat ?? null,
                  home_lng: lng ?? null,
                }))
              }
              placeholder="Tu punto de partida para las rutas"
            />
          </div>
        </Card>

        <Card>
          <CardTitle>Ajustes Predeterminados</CardTitle>
          <div className="mt-3 space-y-3">
            <Input
              label="Radio predeterminado (millas)"
              type="number"
              min={5}
              max={100}
              value={profile.default_radius_miles || 30}
              onChange={(e) =>
                setProfile((p) => ({ ...p, default_radius_miles: Number(e.target.value) }))
              }
            />
            <Input
              label="Tiempo por tienda (minutos)"
              type="number"
              min={10}
              max={120}
              value={profile.default_store_duration_minutes || 40}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  default_store_duration_minutes: Number(e.target.value),
                }))
              }
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <IconChip tone="success">
              <FileSpreadsheet size={16} />
            </IconChip>
            <CardTitle>Google Sheets — Calculadora Amazon</CardTitle>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Pega el ID de tu hoja. Al evaluar una tienda podrás importar los totales automáticamente y la hoja se limpiará.
          </p>
          <div className="mt-3">
            <Input
              label="Google Sheet ID"
              value={googleSheetId}
              onChange={(e) => setGoogleSheetId(e.target.value)}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
            <p className="mt-1 text-xs text-text-muted">
              Encuéntralo en la URL:{' '}
              <span className="font-mono text-primary">docs.google.com/spreadsheets/d/<strong>ID_AQUI</strong>/edit</span>
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <IconChip tone="warning">
              <Wallet size={16} />
            </IconChip>
            <CardTitle>Cuentas Contables — Gastos de Ruta</CardTitle>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Categorías para registrar gastos de la ruta (gasolina, peajes, hotel...). Se restan de la utilidad para calcular la utilidad real.
          </p>

          <div className="mt-3 flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCategory(newCategory);
                }
              }}
              placeholder="Nueva categoría..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => addCategory(newCategory)}
              className="shrink-0 gap-1"
            >
              <Plus size={16} />
              Agregar
            </Button>
          </div>

          {categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((cat) => (
                <span
                  key={cat.id}
                  className="flex items-center gap-1.5 rounded-full bg-surface-secondary py-1.5 pl-3 pr-1.5 text-sm font-medium"
                >
                  {cat.name}
                  <button
                    type="button"
                    onClick={() => removeCategory(cat.id)}
                    aria-label={`Quitar ${cat.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Quick-add suggestions for categories not yet created */}
          {SUGGESTED_CATEGORIES.filter(
            (s) => !categories.some((c) => c.name.toLowerCase() === s.toLowerCase())
          ).length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-text-muted mb-1.5">Sugerencias:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_CATEGORIES.filter(
                  (s) => !categories.some((c) => c.name.toLowerCase() === s.toLowerCase())
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addCategory(s)}
                    className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Tus Tiendas</CardTitle>
          <p className="mt-1 text-xs text-text-muted">
            Agrega las tiendas que quieres visitar en tus rutas
          </p>
          <div className="mt-3">
            <CustomChainsInput
              chains={profile.preferred_chains || []}
              onChange={(chains) => setProfile((p) => ({ ...p, preferred_chains: chains }))}
            />
          </div>
        </Card>

        <Button fullWidth size="lg" onClick={handleSave} loading={saving} className="gap-2">
          <Save size={18} />
          Guardar perfil
        </Button>

        <Button fullWidth variant="outline" onClick={handleSignOut} className="gap-2">
          <LogOut size={18} />
          Cerrar sesión
        </Button>
      </div>
    </AppShell>
  );
}
