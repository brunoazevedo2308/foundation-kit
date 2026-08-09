import { Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * US-004 (3º ciclo) — confirmação de exclusão lógica reutilizável.
 * O registro nunca é removido fisicamente: apenas `deleted_at` é preenchido,
 * preservando o histórico para auditoria.
 */
interface SoftDeleteDialogProps {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  triggerLabel?: string;
}

export function SoftDeleteDialog({
  title,
  description,
  onConfirm,
  triggerLabel = "Excluir",
}: SoftDeleteDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={busy} aria-label={triggerLabel}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{triggerLabel}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
