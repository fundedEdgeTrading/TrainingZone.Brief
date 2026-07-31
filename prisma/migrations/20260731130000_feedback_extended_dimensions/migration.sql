-- Amplía el contraste cliente vs. entrenador de 5 a 9 dimensiones (0-10),
-- las mismas en ambos lados, para una comparación más precisa. Se añaden con
-- un valor intermedio por defecto para no romper las filas ya existentes y
-- luego se retira el default: a partir de aquí la app siempre debe enviarlas
-- explícitamente, igual que el resto de dimensiones.
ALTER TABLE "ClientFeedback" ADD COLUMN     "descanso" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ClientFeedback" ADD COLUMN     "nutricion" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ClientFeedback" ADD COLUMN     "bienestar" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ClientFeedback" ADD COLUMN     "comunicacion" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "ClientFeedback" ALTER COLUMN "descanso" DROP DEFAULT;
ALTER TABLE "ClientFeedback" ALTER COLUMN "nutricion" DROP DEFAULT;
ALTER TABLE "ClientFeedback" ALTER COLUMN "bienestar" DROP DEFAULT;
ALTER TABLE "ClientFeedback" ALTER COLUMN "comunicacion" DROP DEFAULT;

ALTER TABLE "TrainerDebrief" ADD COLUMN     "descanso" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "TrainerDebrief" ADD COLUMN     "nutricion" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "TrainerDebrief" ADD COLUMN     "bienestar" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "TrainerDebrief" ADD COLUMN     "comunicacion" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "TrainerDebrief" ALTER COLUMN "descanso" DROP DEFAULT;
ALTER TABLE "TrainerDebrief" ALTER COLUMN "nutricion" DROP DEFAULT;
ALTER TABLE "TrainerDebrief" ALTER COLUMN "bienestar" DROP DEFAULT;
ALTER TABLE "TrainerDebrief" ALTER COLUMN "comunicacion" DROP DEFAULT;
