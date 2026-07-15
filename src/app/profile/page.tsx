'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Header } from '@/components/layout/header';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomChainsInput } from '@/components/route/custom-chains-input';
import { LocationInput } from '@/components/route/location-input';
import type { UserProfile } from '@/types/database';
import { Save, LogOut } from 'lucide-react';

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

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('users_profile')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      setProfile(existing);
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
    };

    if (profile.id) {
      await supabase.from('users_profile').update(profileData).eq('id', profile.id);
    } else {
      await supabase.from('users_profile').insert(profileData);
    }

    setSaving(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <AppShell>
      <Header title="Profile" />

      <div className="space-y-4 p-4 md:mx-auto md:max-w-2xl md:p-0">
        <Card>
          <CardTitle>Personal Info</CardTitle>
          <div className="mt-3 space-y-3">
            <Input
              label="Full Name"
              value={profile.full_name || ''}
              onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
              placeholder="Your name"
            />
            <LocationInput
              label="Home Address"
              value={profile.home_address || ''}
              onChange={(val, lat, lng) =>
                setProfile((p) => ({
                  ...p,
                  home_address: val,
                  home_lat: lat ?? null,
                  home_lng: lng ?? null,
                }))
              }
              placeholder="Your home base for routes"
            />
          </div>
        </Card>

        <Card>
          <CardTitle>Default Settings</CardTitle>
          <div className="mt-3 space-y-3">
            <Input
              label="Default Radius (miles)"
              type="number"
              min={5}
              max={100}
              value={profile.default_radius_miles || 30}
              onChange={(e) =>
                setProfile((p) => ({ ...p, default_radius_miles: Number(e.target.value) }))
              }
            />
            <Input
              label="Default Time per Store (minutes)"
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
          <CardTitle>Your Custom Stores</CardTitle>
          <p className="mt-1 text-xs text-text-muted">Add the stores you want to visit on your routes</p>
          <div className="mt-3">
            <CustomChainsInput
              chains={profile.preferred_chains || []}
              onChange={(chains) => setProfile((p) => ({ ...p, preferred_chains: chains }))}
            />
          </div>
        </Card>

        <Button fullWidth size="lg" onClick={handleSave} loading={saving} className="gap-2">
          <Save size={18} />
          Save Profile
        </Button>

        <Button fullWidth variant="outline" onClick={handleSignOut} className="gap-2">
          <LogOut size={18} />
          Sign Out
        </Button>
      </div>
    </AppShell>
  );
}
