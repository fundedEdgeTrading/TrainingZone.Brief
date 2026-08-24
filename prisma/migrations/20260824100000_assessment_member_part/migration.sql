-- F-ALTA: la valoración inicial se rellena a dos manos. El socio aporta su
-- parte (perfil, experiencia y constantes) en su primera sesión en la app, y el
-- entrenador la cierra después añadiendo el screening, el PAR-Q y las marcas
-- físicas, que se toman en el centro (F3 §4.2).
--
-- Marca propia y no un `completedAt` a medias: mientras el entrenador no la
-- cierre no hay PAR-Q firmado, y sin PAR-Q no se puede propagar nada a
-- HealthRecord (es la puerta del Art. 9). Sirve además de idempotencia del
-- muro de primera sesión: con fecha, el socio ya no vuelve a verlo.
ALTER TABLE "Assessment" ADD COLUMN "memberPartAt" TIMESTAMP(3);

-- Las valoraciones ya cerradas se quedan con NULL a propósito: se rellenaron
-- enteras del lado del entrenador, que era la única vía hasta ahora. El muro
-- solo mira las que siguen abiertas (`completedAt IS NULL`), así que ningún
-- socio con su valoración hecha se lo encuentra al entrar.
