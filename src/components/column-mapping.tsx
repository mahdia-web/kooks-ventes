'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ColumnMapping } from '@/lib/types';

interface ColumnMappingProps {
  columns: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  onAutoDetect: () => void;
}

const FIELDS: { key: keyof ColumnMapping; label: string; description: string; required?: boolean }[] = [
  { key: 'agent', label: 'Agent commercial', description: "Nom de l'agent / commercial", required: true },
  { key: 'date', label: 'Date de vente', description: 'Date de la transaction' },
  { key: 'product', label: 'Produit', description: 'Article ou libellé vendu' },
  { key: 'category', label: 'Catégorie', description: 'Famille ou segment du produit' },
  { key: 'quantity', label: 'Quantité', description: 'Nombre d\'unités vendues' },
  { key: 'amount', label: 'Montant', description: 'Chiffre d\'affaires de la vente', required: true },
];

export function ColumnMappingCard({
  columns,
  mapping,
  onMappingChange,
  onAutoDetect,
}: ColumnMappingProps) {
  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wand2 className="h-5 w-5 text-emerald-600" />
              Correspondance des colonnes
            </CardTitle>
            <CardDescription className="mt-1">
              Affectez chaque champ d'analyse à une colonne de votre fichier. Les champs requis sont marqués d'un astérisque.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onAutoDetect}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            <Wand2 className="h-4 w-4 mr-1" /> Auto-détection
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((field) => {
            const value = mapping[field.key];
            return (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key} className="text-sm font-medium">
                  {field.label}
                  {field.required && <span className="text-rose-500 ml-1">*</span>}
                </Label>
                <Select
                  value={value ?? '__none__'}
                  onValueChange={(v) =>
                    onMappingChange({
                      ...mapping,
                      [field.key]: v === '__none__' ? null : v,
                    })
                  }
                >
                  <SelectTrigger id={field.key} className="w-full">
                    <SelectValue placeholder="— Aucune —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Aucune —</SelectItem>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {field.description}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
