import { useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";

import { useAccountDeletion, useRequestAccountDeletion } from "@/api/queries";
import { ApiError } from "@/api/client";
import type { AccountDeletionEffect, AccountDeletionRequestDto } from "@/api/types";
import { goBack } from "@/utils/navigation";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { useToast } from "@/components/Toast";

/**
 * E5-15 · Borrar mi cuenta, desde la app.
 *
 * Es la ruta in-app que exige App Store Review 5.1.1(v), y vive FUERA de las
 * pestañas —se llega desde «Mi cuenta»— por lo mismo que «Cerrar sesión» no
 * está en la barra: es la acción más costosa de deshacer de toda la app.
 *
 * Todo el texto de qué se borra y qué se conserva llega del servidor
 * (`GET /portal/account-deletion`), que lo saca del mismo plan de supresión que
 * ejecuta el borrado. Aquí NO hay una tabla espejo: si la hubiera, el día que
 * el centro cambie un plazo la app seguiría prometiendo el anterior.
 */

const ACTION_LABEL: Record<AccountDeletionEffect["action"], string> = {
  DELETE: "Se borra",
  DISSOCIATE: "Se conserva sin tu nombre",
  ANONYMIZE: "Se conserva desligado de ti",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function years(days: number): string {
  return (Math.round((days / 365) * 10) / 10).toString().replace(".", ",");
}

function RequestStatus({ request }: { request: AccountDeletionRequestDto }) {
  const theme = useTheme();
  const source = request.source === "MOBILE_APP" ? "desde la app" : "desde el portal web";

  if (request.status === "PENDING") {
    return (
      <Card tone="accent" style={{ gap: 6 }}>
        <Text style={[typo.cardTitle, { color: theme.text }]}>Tu solicitud está en curso</Text>
        <Text style={[typo.body, { color: theme.textSecondary }]}>
          La pediste el {formatDate(request.requestedAt)} {source}. Tu centro tiene hasta el{" "}
          {formatDate(request.dueAt)} para resolverla: es el plazo máximo de un mes del art. 12.3 RGPD. Te avisaremos
          por correo en cuanto esté hecha.
        </Text>
        <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
          Mientras tanto puedes seguir usando tu cuenta con normalidad. Si cambias de idea, dilo en tu centro.
        </Text>
      </Card>
    );
  }

  const denied = request.status === "REJECTED";
  return (
    <Card style={{ gap: 6 }}>
      <Text style={[typo.cardTitle, { color: theme.text }]}>
        {denied ? "Tu solicitud fue denegada" : "Tu solicitud está resuelta"}
      </Text>
      <Text style={[typo.body, { color: theme.textSecondary }]}>
        La pediste el {formatDate(request.requestedAt)} {source}
        {request.resolvedAt ? ` y se resolvió el ${formatDate(request.resolvedAt)}` : ""}.
      </Text>
      {request.resolutionNotes ? (
        <Text style={[typo.body, { color: theme.textSecondary }]}>«{request.resolutionNotes}»</Text>
      ) : null}
      {denied ? (
        <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
          Si no estás de acuerdo, puedes reclamar ante la Agencia Española de Protección de Datos.
        </Text>
      ) : null}
    </Card>
  );
}

export default function DeleteAccountScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch, isRefetching } = useAccountDeletion();
  const request = useRequestAccountDeletion();

  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const open = data?.request?.status === "PENDING";

  async function submit() {
    setFieldError(null);
    try {
      await request.mutateAsync(password);
      setPassword("");
      setUnderstood(false);
      toast.show("Solicitud registrada. Te hemos enviado el acuse por correo.", "good");
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "No se ha podido registrar tu solicitud. Inténtalo de nuevo.";
      setFieldError(message);
      toast.show(message, "critical");
    }
  }

  return (
    // `withTabBar={false}`: esta pantalla vive FUERA del grupo (tabs), así que
    // no hay barra que absorba el área segura inferior y la reserva ella. Sin
    // esto, el botón de pedir el borrado quedaba pisado por el indicador de
    // gestos justo en la pantalla donde hay que leerlo entero antes de tocarlo.
    <ScreenContainer
      withTabBar={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={theme.gold} />}
    >
      <FadeInUp>
        <ScreenHeader
          kicker="MI CUENTA"
          title="Borrar mi cuenta"
          tight
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={() => goBack("/perfil")}
              style={[styles.iconButton, { borderColor: theme.border }]}
            >
              <Icon name="chevron-left" size={17} color={theme.text} />
            </Pressable>
          }
        />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError || !data ? (
        <QueryErrorState
          error={error}
          title="No se ha podido cargar"
          description="Desliza hacia abajo para reintentar."
        />
      ) : (
        <>
          {data.request ? (
            <FadeInUp delay={stagger(1)}>
              <RequestStatus request={data.request} />
            </FadeInUp>
          ) : null}

          <FadeInUp delay={stagger(2)}>
            <SectionTitle label="QUÉ PASA CON TUS DATOS" />
            <Card style={{ gap: 12 }}>
              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                Esto no es un resumen: es el plan que se ejecuta, bloque a bloque, y el mismo que ve tu centro.
              </Text>
              {data.disclosure.effects.map((effect) => (
                <View key={effect.key} style={[styles.effect, { borderTopColor: theme.border }]}>
                  <View style={styles.effectHead}>
                    <Text style={[typo.cardTitle, { color: theme.text, flexShrink: 1 }]}>{effect.label}</Text>
                    <Text style={[typo.label, { color: theme.goldText }]}>{ACTION_LABEL[effect.action]}</Text>
                  </View>
                  <Text style={[typo.body, { color: theme.textSecondary }]}>{effect.detail}</Text>
                  {effect.legalBasis ? (
                    <Text style={[typo.rowMeta, { color: theme.textMuted }]}>Base legal: {effect.legalBasis}.</Text>
                  ) : null}
                </View>
              ))}
              <Text style={[typo.rowMeta, { color: theme.textMuted, borderTopColor: theme.border, borderTopWidth: 1, paddingTop: 10 }]}>
                Plazos que aplica tu centro hoy: {data.disclosure.retention.billingDays} días (
                {years(data.disclosure.retention.billingDays)} años) para el contrato y los cobros, y{" "}
                {data.disclosure.retention.healthDays} días ({years(data.disclosure.retention.healthDays)} años) para
                los datos de salud, contados desde el fin de la relación.
                {data.disclosure.retention.pendingLegalReview
                  ? " ⟦PENDIENTE: validación jurídica de los plazos — decisión D-C3⟧. Son la propuesta de anclaje vigente, no un dictamen."
                  : ""}
              </Text>
            </Card>
          </FadeInUp>

          <FadeInUp delay={stagger(3)}>
            <Card style={{ gap: 6 }}>
              <Text style={[typo.cardTitle, { color: theme.text }]}>Los cobros no se borran</Text>
              <Text style={[typo.body, { color: theme.textSecondary }]}>
                Los cobros que ya se te emitieron se disocian, no se borran: se conservan el número de recibo, el
                importe, la fecha y el método de pago, y se les retira el vínculo contigo. Dejan de identificarte y
                siguen contando en la contabilidad del periodo. Tu centro está obligado a conservarlos (art. 30 del
                Código de Comercio y art. 66 de la Ley General Tributaria).
              </Text>
            </Card>
          </FadeInUp>

          {!open ? (
            <FadeInUp delay={stagger(4)}>
              <SectionTitle label="PEDIR EL BORRADO" />
              <Card style={{ gap: 14 }}>
                <Text style={[typo.rowMeta, { color: theme.textMuted }]}>{data.deadlineText}</Text>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: understood }}
                  accessibilityLabel="He leído qué se borra y qué se conserva"
                  onPress={() => setUnderstood((v) => !v)}
                  style={styles.checkRow}
                >
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: understood ? theme.gold : theme.border, backgroundColor: understood ? theme.gold : "transparent" },
                    ]}
                  >
                    {understood ? <Icon name="check" size={13} color="#1D1D1C" /> : null}
                  </View>
                  <Text style={[typo.body, { color: theme.textSecondary, flex: 1 }]}>
                    He leído qué se borra y qué se conserva, y entiendo que los cobros que ya se me emitieron no se
                    borran: se conservan sin mi nombre, porque el centro está obligado a conservarlos.
                  </Text>
                </Pressable>

                <Field
                  label="TU CONTRASEÑA"
                  placeholder="Para confirmar que eres tú"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setFieldError(null);
                  }}
                  error={fieldError}
                />

                <Button
                  title="Pedir el borrado de mi cuenta"
                  variant="danger"
                  loading={request.isPending}
                  disabled={!understood || password.length === 0 || request.isPending}
                  onPress={submit}
                />
              </Card>
            </FadeInUp>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  effect: { gap: 4, borderTopWidth: 1, paddingTop: 10 },
  effectHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 2 },
});
