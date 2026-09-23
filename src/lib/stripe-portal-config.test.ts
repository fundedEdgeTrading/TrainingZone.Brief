import test from "node:test";
import assert from "node:assert/strict";
import {
  APTA_PORTAL_CONFIG_TAG,
  ensureMemberPortalConfiguration,
  memberPortalConfigurationParams,
  portalConfigKey,
  type PortalConfigStripe,
} from "@/lib/stripe-portal-config";

/**
 * CON-02 · La cuenta conectada no tenía configuración del Billing Portal: la
 * sesión del portal del socio fallaba en cualquier gimnasio recién conectado.
 * Sin red: un Stripe de mentira que recuerda lo que se le ha creado y respeta
 * las claves de idempotencia como el de verdad.
 */

type FakeConfig = { id: string; is_default: boolean; active: boolean; metadata: Record<string, string> };
type CreateCall = { params: unknown; opts: { stripeAccount?: string; idempotencyKey?: string } };

function fakeStripe(initial: FakeConfig[] = []) {
  const configs = [...initial];
  const creates: CreateCall[] = [];
  const byKey = new Map<string, FakeConfig>();
  const stripe = {
    billingPortal: {
      configurations: {
        list: async (params: { is_default?: boolean; active?: boolean }) => ({
          data: configs.filter(
            (c) =>
              (params.is_default === undefined || c.is_default === params.is_default) &&
              (params.active === undefined || c.active === params.active)
          ),
        }),
        create: async (params: { metadata?: Record<string, string> }, opts: CreateCall["opts"]) => {
          creates.push({ params, opts });
          const cached = opts.idempotencyKey ? byKey.get(opts.idempotencyKey) : undefined;
          if (cached) return cached;
          // Como en Stripe: una configuración creada por API no pasa a ser la por defecto.
          const created: FakeConfig = { id: `bpc_${configs.length + 1}`, is_default: false, active: true, metadata: params.metadata ?? {} };
          configs.push(created);
          if (opts.idempotencyKey) byKey.set(opts.idempotencyKey, created);
          return created;
        },
      },
    },
  };
  return { stripe: stripe as unknown as PortalConfigStripe, configs, creates };
}

test("CON-02: sin configuración, se crea con método de pago, facturas y baja a fin de periodo", async () => {
  const fx = fakeStripe();
  const r = await ensureMemberPortalConfiguration(fx.stripe, "org_1", "acct_1");
  assert.equal(r.state, "created");
  assert.equal(fx.creates.length, 1);
  assert.equal(fx.creates[0].opts.stripeAccount, "acct_1", "en la cuenta CONECTADA, no en la de Apta");
  assert.equal(fx.creates[0].opts.idempotencyKey, portalConfigKey("org_1", "acct_1"));

  const f = memberPortalConfigurationParams().features;
  assert.equal(f.payment_method_update?.enabled, true);
  assert.equal(f.invoice_history?.enabled, true);
  assert.equal(f.subscription_cancel?.enabled, true);
  assert.equal(f.subscription_cancel?.mode, "at_period_end");
  assert.equal(f.subscription_update?.enabled, false, "sin cambio de plan ni de cantidades");
});

test("CON-02: si el gimnasio ya tiene una por defecto, no se pisa ni se crea otra", async () => {
  const fx = fakeStripe([{ id: "bpc_suya", is_default: true, active: true, metadata: {} }]);
  const r = await ensureMemberPortalConfiguration(fx.stripe, "org_1", "acct_1");
  assert.deepEqual(r, { state: "default-exists", configurationId: "bpc_suya" });
  assert.equal(fx.creates.length, 0);
});

test("CON-02: es idempotente — la segunda llamada reutiliza la de Apta", async () => {
  const fx = fakeStripe();
  const a = await ensureMemberPortalConfiguration(fx.stripe, "org_1", "acct_1");
  const b = await ensureMemberPortalConfiguration(fx.stripe, "org_1", "acct_1");
  assert.equal(b.state, "existing");
  assert.equal(b.configurationId, a.configurationId);
  assert.equal(fx.creates.length, 1);
  assert.equal(fx.configs.filter((c) => c.metadata.apta === APTA_PORTAL_CONFIG_TAG).length, 1);
});

test("CON-02: dos llamadas simultáneas acaban en la misma configuración (clave de idempotencia)", async () => {
  const fx = fakeStripe();
  const [a, b] = await Promise.all([
    ensureMemberPortalConfiguration(fx.stripe, "org_1", "acct_1"),
    ensureMemberPortalConfiguration(fx.stripe, "org_1", "acct_1"),
  ]);
  assert.equal(a.configurationId, b.configurationId);
  assert.equal(fx.configs.length, 1);
});
