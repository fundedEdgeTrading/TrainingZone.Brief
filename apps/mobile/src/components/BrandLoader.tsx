import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { useReducedMotion } from "@/theme/motion";
import { Icon } from "./Icon";

/**
 * Velo de marca para esperas LARGAS con IA (generar y refinar un mesociclo:
 * 60-120 s). Portado de `src/components/ui/brand-loader.tsx` de la web, con las
 * mismas reglas de honestidad, que son lo que hace útil este componente:
 *
 * - Cada paso real del servidor tiene su tramo, proporcional a lo que cuesta.
 * - Dentro de un tramo el nivel llega al 92 % y ESPERA. Solo lo desbloquea el
 *   paso siguiente: la animación nunca promete un progreso que no existe.
 * - El 100 % llega únicamente con `done`, junto al check.
 * - El velo se queda 1150 ms con el resultado a la vista antes de retirarse.
 *
 * Es el ÚNICO estado de espera que bloquea. Para la primera carga de datos van
 * los esqueletos (`Skeleton`), y para una acción corta —reservar, guardar
 * feedback, descartar— el propio botón en `loading`: tapar la pantalla media
 * décima de segundo hace la app más lenta de lo que es.
 *
 * Añadido propio del móvil: «Avisarme al terminar». En web la ventana se queda
 * abierta; en el móvil, un minuto y medio mirando un velo es un minuto y medio
 * en el que la app está secuestrada.
 */

export type LoaderStep = { label: string; weight: number };

/** Los cinco tramos de la generación, con su coste real (espejo de la web). */
export const MESOCYCLE_STEPS: LoaderStep[] = [
  { label: "Preparando la ficha seudonimizada del socio", weight: 1.1 },
  { label: "Comprobando el semáforo de aptitud", weight: 0.9 },
  { label: "La IA diseña las fases del mesociclo", weight: 3.4 },
  { label: "Escribiendo ejercicios, series y el porqué", weight: 2.6 },
  { label: "Guardando el borrador", weight: 1.0 },
];

/** Los tres tramos del refinado: la otra espera larga con IA. */
export const MESOCYCLE_REFINE_STEPS: LoaderStep[] = [
  { label: "Releyendo el plan y lo que ya le pediste", weight: 0.8 },
  { label: "La IA reescribe solo lo que has pedido", weight: 3.6 },
  { label: "Guardando el plan revisado", weight: 1.0 },
];

/** Duración medida de la generación completa. No es un límite: es la calibración. */
export const EXPECTED_MS = 95_000;
export const EXPECTED_REFINE_MS = 45_000;

/** Tope del nivel dentro de un tramo. El resto solo lo desbloquea el servidor. */
const STEP_CEILING = 0.92;
/** Lo que el velo se queda con el 100 % y el check a la vista antes de irse. */
export const LOADER_OUTRO_MS = 1150;
const LOGO_WIDTH = 250;
const LOGO_HEIGHT = 42;

export function usePacedLoader(steps: LoaderStep[], expectedMs: number, options: { outroMs?: number } = {}) {
  const outroMs = options.outroMs ?? LOADER_OUTRO_MS;
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(() => {
    clear();
    setStep(0);
    setDone(false);
    setLoading(true);
    const total = steps.reduce((sum, s) => sum + s.weight, 0) || 1;
    let acc = 0;
    timers.current = steps.slice(0, -1).map((s, i) => {
      acc += (expectedMs * s.weight) / total;
      return setTimeout(() => setStep(i + 1), acc);
    });
  }, [clear, expectedMs, steps]);

  /** La acción ha fallado: fuera el velo. El error lo cuenta el toast. */
  const abort = useCallback(() => {
    clear();
    setLoading(false);
  }, [clear]);

  /** Confirmado: nivel al 100 %, check, y solo cuando eso se ha visto, `after`. */
  const finish = useCallback(
    (after: () => void) => {
      clear();
      setStep(Math.max(0, steps.length - 1));
      setDone(true);
      timers.current = [
        setTimeout(() => {
          setLoading(false);
          after();
        }, outroMs),
      ];
    },
    [clear, outroMs, steps.length]
  );

  return { loading, step, done, start, abort, finish };
}

/** Nivel objetivo del tramo vivo: hasta el 92 % de su tramo, o el 100 % con `done`. */
function targetLevel(steps: LoaderStep[], step: number, done: boolean): number {
  if (done) return 1;
  const total = steps.reduce((sum, s) => sum + s.weight, 0) || 1;
  const before = steps.slice(0, step).reduce((sum, s) => sum + s.weight, 0) / total;
  const own = (steps[step]?.weight ?? 0) / total;
  return before + own * STEP_CEILING;
}

export function BrandLoader({
  steps,
  step,
  done,
  title = "Generando el mesociclo",
  hint = "Puedes salir: te avisamos cuando esté.",
  onNotifyMe,
}: {
  steps: LoaderStep[];
  step: number;
  done: boolean;
  title?: string;
  hint?: string;
  /** «Avisarme al terminar»: permite salir del velo sin abortar el trabajo. */
  onNotifyMe?: () => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [level] = useState(() => new Animated.Value(0));
  const [pct, setPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const target = targetLevel(steps, step, done);

  useEffect(() => {
    // El nivel persigue su objetivo amortiguado; con `reduced` salta seco.
    const animation = Animated.timing(level, {
      toValue: target,
      duration: reduced ? 0 : 900,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [level, target, reduced]);

  useEffect(() => {
    const id = level.addListener(({ value }) => setPct(Math.round(value * 100)));
    return () => level.removeListener(id);
  }, [level]);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const width = level.interpolate({ inputRange: [0, 1], outputRange: [0, LOGO_WIDTH] });

  return (
    // El velo bloquea gestos y navegación: `onRequestClose` a vacío para que el
    // botón atrás de Android tampoco lo cierre a medias.
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.veil}>
        <Text style={[typo.legend, styles.process, { color: theme.textMuted }]}>{title}</Text>

        <View style={styles.logoBox}>
          {/* Dos capas: el wordmark al 16 % de fondo y el relleno recortado al nivel. */}
          <Image
            source={require("../../assets/images/tz-logo-white.png")}
            style={[styles.logo, { opacity: 0.16 }]}
            resizeMode="contain"
          />
          <Animated.View style={[styles.clip, { width }]}>
            <Image source={require("../../assets/images/tz-logo-white.png")} style={styles.logo} resizeMode="contain" />
          </Animated.View>
        </View>

        <View style={styles.readout}>
          <Text style={[styles.pct, { color: theme.text }]}>{pct} %</Text>
          <Text style={[styles.clockText, { color: theme.textMuted }]}>{clock}</Text>
        </View>

        {/* Dos líneas reservadas: la frase cambia de tramo sin que salte el resto. */}
        <Text style={[styles.phrase, { color: theme.text }]} numberOfLines={2}>
          {done ? "Listo" : (steps[step]?.label ?? "")}
        </Text>

        <View style={styles.segments}>
          {steps.map((s, i) => (
            <View
              key={s.label}
              style={[
                styles.segment,
                { backgroundColor: i < step ? theme.text : i === step ? theme.textMuted : theme.border },
              ]}
            />
          ))}
        </View>

        {done ? (
          <View style={styles.doneRow}>
            <Icon name="check" size={18} color={theme.good} />
            <Text style={[typo.rowTitleSmall, { color: theme.good }]}>Mesociclo listo</Text>
          </View>
        ) : (
          <Text style={[typo.rowMeta, { color: theme.textFaint, textAlign: "center" }]}>{hint}</Text>
        )}

        {onNotifyMe && !done ? (
          <Pressable
            accessibilityRole="button"
            onPress={onNotifyMe}
            style={[styles.notify, { borderColor: theme.border }]}
          >
            <Icon name="bell" size={15} color={theme.textSecondary} />
            <Text style={[typo.buttonSmall, { color: theme.textSecondary }]}>Avisarme al terminar</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: {
    flex: 1,
    backgroundColor: "rgba(29,29,28,.9)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  process: { letterSpacing: 1.9, textAlign: "center" },
  logoBox: { width: LOGO_WIDTH, height: LOGO_HEIGHT, maxWidth: "100%" },
  logo: { width: LOGO_WIDTH, height: LOGO_HEIGHT, position: "absolute", left: 0, top: 0 },
  clip: { position: "absolute", left: 0, top: 0, height: LOGO_HEIGHT, overflow: "hidden" },
  readout: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  pct: { fontFamily: fonts.bold, fontSize: 21, ...tabular },
  clockText: { fontFamily: fonts.medium, fontSize: 13, ...tabular },
  // Reserva de dos líneas: sin ella la frase de cada tramo empuja el resto.
  phrase: { fontFamily: fonts.semibold, fontSize: 17, textAlign: "center", minHeight: 48, lineHeight: 24 },
  segments: { flexDirection: "row", gap: 6, alignSelf: "stretch" },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  notify: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingHorizontal: 16,
    height: 42,
  },
});
