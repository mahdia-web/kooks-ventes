'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Store, Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ClientOption {
  canonical: string;
  variants: string[];
}

interface SearchableClientSelectProps {
  options: ClientOption[];
  value: string; // canonical name or '' for 'Tous'
  onChange: (variantsPipeSeparated: string, canonicalName: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Liste déroulante avec recherche intelligente pour les clients.
 *
 * Fonctionnalités :
 *  - Recherche en temps réel dans les noms canoniques
 *  - Insensible à la casse et aux accents
 *  - Match sur n'importe quel mot du nom (pas seulement le début)
 *  - Affiche "Tous les clients" en haut quand la recherche est vide
 *
 * Quand l'utilisateur sélectionne un client, onChange est appelé avec :
 *   - variantsPipeSeparated : les variants séparés par '|' pour l'API
 *   - canonicalName : le nom canonique à afficher dans le trigger
 */
export function SearchableClientSelect({
  options,
  value,
  onChange,
  placeholder = 'Tous les clients',
  className,
}: SearchableClientSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Normalisation pour la recherche (insensible aux accents + casse)
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[''`]/g, '')
      .trim();

  // Filtre les options en fonction de la recherche
  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return options;
    // Match si n'importe quel mot du nom contient la recherche
    return options.filter((opt) => {
      const n = normalize(opt.canonical);
      return n.includes(q) || q.split(/\s+/).some((word) => n.includes(word));
    });
  }, [options, search]);

  // Le nom affiché dans le trigger
  const selectedOption = options.find((opt) => opt.canonical === value);
  const triggerLabel = selectedOption ? selectedOption.canonical : placeholder;

  useEffect(() => {
    // Réinitialise la recherche quand le menu se ferme
    if (!open) {
      const t = setTimeout(() => setSearch(''), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-8 text-sm justify-between w-[220px] font-normal', className)}
        >
          <Store className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate flex-1 text-left">
            {triggerLabel.length > 28 ? triggerLabel.slice(0, 28) + '...' : triggerLabel}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder="Rechercher un client..."
              value={search}
              onValueChange={setSearch}
              className="h-9 flex-1"
            />
          </div>
          <CommandList>
            <CommandEmpty>Aucun client trouvé.</CommandEmpty>
            <CommandGroup>
              {/* Option "Tous les clients" — toujours en haut */}
              <CommandItem
                key="__all__"
                value=""
                onSelect={() => {
                  onChange('', '');
                  setOpen(false);
                }}
              >
                <Store className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1 font-medium">Tous les clients</span>
                {!value && <Check className="h-4 w-4 text-primary" />}
              </CommandItem>
              {filtered.map((opt) => (
                <CommandItem
                  key={opt.canonical}
                  value={opt.canonical}
                  onSelect={() => {
                    onChange(opt.variants.join('|'), opt.canonical);
                    setOpen(false);
                  }}
                >
                  <Store className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">
                    {opt.canonical}
                    {opt.variants.length > 1 && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        ({opt.variants.length} variants)
                      </span>
                    )}
                  </span>
                  {value === opt.canonical && <Check className="h-4 w-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
