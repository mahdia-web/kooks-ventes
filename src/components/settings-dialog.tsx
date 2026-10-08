'use client';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { SettingsPanel } from '@/components/settings-panel';
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  return (<Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline" size="icon" title="Paramètres (clients, agents, taux)"><Settings className="h-4 w-4" /></Button></SheetTrigger><SheetContent side="left" className="sm:max-w-2xl w-full overflow-y-auto p-4"><SheetHeader className="mb-4"><SheetTitle>Paramètres</SheetTitle><SheetDescription>Gérez les commerciaux et l'affiliation des clients (Direct/Centrale, taux de marge).</SheetDescription></SheetHeader><SettingsPanel /></SheetContent></Sheet>);
}
