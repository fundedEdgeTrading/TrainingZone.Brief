-- Mapa de barrios (/mapa-barrios): el centro deja de ser solo una dirección
-- postal y pasa a tener coordenadas. Sin ellas no hay marcador que pintar, ni
-- anillo de "15 min andando", ni distancia de cada barrio al centro más
-- cercano — que es la mitad de las preguntas que la pantalla contesta.
--
-- Nullable a propósito: un centro dado de alta sin coordenadas sigue siendo un
-- centro válido; simplemente no se sitúa en el mapa (y sus barrios calculan la
-- distancia contra el resto de centros que sí lo estén).
ALTER TABLE "Center" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Center" ADD COLUMN "lng" DOUBLE PRECISION;
