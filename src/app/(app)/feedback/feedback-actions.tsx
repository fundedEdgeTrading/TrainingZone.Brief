"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestFeedbackAction, markFeedbackReviewedAction, scheduleFollowUpAction } from "./actions";

export function RequestFeedbackButton({ memberId }: { memberId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await requestFeedbackAction(memberId);
          if (result.ok) toast.success("Feedback solicitado al socio");
          else toast.error(result.error);
        })
      }
    >
      Solicitar feedback
    </Button>
  );
}

export function FeedbackDetailActions({
  memberId,
  canReview,
  alreadyReviewed,
}: {
  memberId: string;
  canReview: boolean;
  alreadyReviewed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <Button
        type="button"
        variant="primary"
        disabled={pending || !canReview || alreadyReviewed}
        onClick={() =>
          startTransition(async () => {
            const result = await markFeedbackReviewedAction(memberId);
            if (result.ok) toast.success("Marcado como revisado");
            else toast.error(result.error);
          })
        }
      >
        {alreadyReviewed ? "Ya revisado" : canReview ? "Marcar como revisado" : "Sin debrief que revisar"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await scheduleFollowUpAction(memberId);
            if (result.ok) toast.success("Seguimiento 1:1 programado");
            else toast.error(result.error);
          })
        }
      >
        Programar seguimiento 1:1
      </Button>
    </div>
  );
}
