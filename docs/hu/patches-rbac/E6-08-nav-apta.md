# E6-08 · entrada de menú de `/apta`

`rbac.ts` está congelado este trimestre. `NAV_BY_ROLE.PLATFORM_ADMIN` hoy es:

```ts
PLATFORM_ADMIN: [
  { href: "/dashboard", label: "Panel de control", section: "Vista general", icon: "panel" },
  { href: "/anuncios", label: "Anuncios", section: "Vista general", icon: "anuncios" },
  { href: "/organization", label: "Organización", section: "Vista general", icon: "organizacion" },
  { href: "/audit", label: "Auditoría", section: "Vista general", icon: "auditoria" },
],
```

Lo que se pediría en la ventana de merge:

```ts
PLATFORM_ADMIN: [
  { href: "/apta", label: "Back-office", section: "Vista general", icon: "apta" },
  { href: "/dashboard", label: "Panel de control", section: "Vista general", icon: "panel" },
  { href: "/anuncios", label: "Anuncios", section: "Vista general", icon: "anuncios" },
  { href: "/organization", label: "Organización", section: "Vista general", icon: "organizacion" },
  { href: "/audit", label: "Auditoría", section: "Vista general", icon: "auditoria" },
],
```

Primera entrada de la lista: es la pantalla de aterrizaje real de soporte, más
usada que el propio `/dashboard` de plataforma.

También hace falta un `NavIcon` nuevo (el tipo vive en `rbac.ts`, junto a
`NavItem`): `| "apta"`, con su trazo en `src/components/nav-icons.tsx` (no
frozen, listo para añadir en cuanto exista la clave). Sugerencia de trazo: un
escudo o una llave inglesa — algo que no se confunda con `organizacion`
(edificio) ni con `panel` (cuadrícula).

## Mientras tanto

`/apta` funciona y está protegido (`requireRole(["PLATFORM_ADMIN"])` en la
página y en cada server action) aunque no tenga entrada de menú. Se ha añadido
un enlace visible solo para `PLATFORM_ADMIN` en `/organization` (su otra
pantalla de aterrizaje actual) que apunta a `/apta`, para que soporte pueda
llegar sin escribir la URL a mano. Es un puente, no el sitio final: en cuanto
`rbac.ts` se descongele, este enlace se retira y `/apta` pasa a vivir en el
nav como cualquier otra sección.
