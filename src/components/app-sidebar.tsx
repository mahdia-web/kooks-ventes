'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Home,
  Settings,
  BarChart3,
  Calendar,
  TrendingUp,
  Users,
  Store,
  Package,
} from 'lucide-react';
import type { DashboardData } from '@/lib/dashboard-types';
import { formatEuro, formatNumber, monthLabel, formatDate } from '@/lib/dashboard-service';

interface AppSidebarProps {
  data: DashboardData | null;
  agentFilter: string;
  onHome: () => void;
}

export function AppSidebar({ data, agentFilter, onHome }: AppSidebarProps) {
  const totalCa = data?.global.totalCaHT ?? 0;
  const totalBL = data?.global.totalNbBl ?? 0;
  const totalEnseignes = data?.global.totalEnseignes ?? 0;
  const totalCommission = data?.global.totalCommission ?? 0;
  const dateRange = data?.global.dateRange;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-40">
      {/* Logo + nom Kooks */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-title text-xl font-bold text-sidebar-foreground leading-tight">
              Kooks
            </h1>
            <p className="text-xs text-muted-foreground">Suivi Ventes</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start font-medium hover:bg-sidebar-accent"
          onClick={onHome}
        >
          <Home className="h-4 w-4 mr-3 text-primary" />
          Accueil
        </Button>
        <Link href="/clients" className="block">
          <Button
            variant="ghost"
            className="w-full justify-start font-medium hover:bg-sidebar-accent"
          >
            <Store className="h-4 w-4 mr-3 text-primary" />
            Clients
          </Button>
        </Link>
        <Link href="/volumes" className="block">
          <Button
            variant="ghost"
            className="w-full justify-start font-medium hover:bg-sidebar-accent"
          >
            <Package className="h-4 w-4 mr-3 text-primary" />
            Volumes
          </Button>
        </Link>
        <Link href="/settings" className="block">
          <Button
            variant="ghost"
            className="w-full justify-start font-medium hover:bg-sidebar-accent"
          >
            <Settings className="h-4 w-4 mr-3 text-primary" />
            Paramètres
          </Button>
        </Link>
      </nav>

      {/* Footer sidebar */}
      <div className="p-3 border-t border-sidebar-border">
        <p className="text-[10px] text-muted-foreground text-center">
          Données persistées sur Supabase
        </p>
      </div>
    </aside>
  );
}
