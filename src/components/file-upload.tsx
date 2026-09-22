'use client';

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  fileName?: string | null;
  disabled?: boolean;
}

export function FileUpload({ onFileSelected, fileName, disabled }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      const file = files.find((f) =>
        /\.(xlsx|xls|csv|ods)$/i.test(f.name)
      );
      if (file) {
        onFileSelected(file);
      }
    },
    [onFileSelected, disabled]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
    // Réinitialiser pour permettre de sélectionner le même fichier
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
        isDragging
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
          : 'border-slate-300 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600',
        disabled && 'opacity-60 pointer-events-none'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.ods"
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled}
        id="file-upload-input"
        data-testid="file-input"
      />

      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
        {fileName ? (
          <FileSpreadsheet className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <UploadCloud className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        )}
      </div>

      <div className="space-y-1">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {fileName ? fileName : 'Glissez-déposez votre fichier Excel ici'}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {fileName
            ? 'Fichier chargé. Vous pouvez le remplacer ou lancer l\'analyse.'
            : 'Formats acceptés : .xlsx, .xls, .csv, .ods'}
        </p>
      </div>

      <Button
        type="button"
        variant={fileName ? 'outline' : 'default'}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {fileName ? 'Changer de fichier' : 'Parcourir les fichiers'}
      </Button>
    </div>
  );
}

export function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-slate-500 hover:text-rose-600"
    >
      <X className="h-4 w-4 mr-1" /> Effacer
    </Button>
  );
}
