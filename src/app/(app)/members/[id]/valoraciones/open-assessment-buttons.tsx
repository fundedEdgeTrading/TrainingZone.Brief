"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { openAssessmentAction } from "./actions";
import type { AssessmentKind } from "@prisma/client";

/**
 * Apertura manual de un hito. El cron del aniversario (F4) abre los suyos solo;
 * esto es para la valoración inicial y para adelantar una revisión.
 */
export function OpenAssessmentButton({
  memberId,
  kind,
  label,
  variant = "secondary",
}: {
  memberId: string;
  kind: AssessmentKind;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={variant}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openAssessmentAction(memberId, kind);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.push(`/members/${memberId}/valoraciones/${result.assessmentId}`);
        })
      }
    >
      {label}
    </Button>
  );
}
