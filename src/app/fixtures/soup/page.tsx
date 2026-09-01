import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FlowStack — Ship faster with AI-native workflows",
  description: "The modern platform for product teams who move fast.",
  robots: { index: false, follow: false },
};

/** Raw HTML with literal onclick attributes so audit heuristics see click-handler soup. */
const SOUP_HTML = `
<noscript>Please enable JavaScript</noscript>
<div id="root"></div>
<div class="fs-shell" style="font-family:system-ui,sans-serif;color:#e8e6e1;background:#0e1116;min-height:100vh">
  <div class="fs-nav" style="display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid #262d38">
    <div class="fs-logo" style="font-weight:600;letter-spacing:-0.02em">FlowStack</div>
    <div style="display:flex;gap:1.25rem;font-size:0.875rem;color:#8b93a1">
      <div class="nav-item" onclick="navigate('product')">Product</div>
      <div class="nav-item" onclick="navigate('pricing')">Pricing</div>
      <div class="nav-item" onclick="navigate('docs')">Docs</div>
    </div>
  </div>
  <div class="fs-hero" style="max-width:56rem;margin:0 auto;padding:4rem 1.5rem 2rem;text-align:center">
    <div style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:#8b93a1">Now in public beta</div>
    <div style="font-size:clamp(2rem,5vw,3.5rem);font-weight:600;margin-top:1rem;line-height:1.05">Ship AI-native workflows without the div soup</div>
    <div style="margin-top:1rem;color:#8b93a1;max-width:36rem;margin-inline:auto">Looks polished to humans. Built entirely from divs and onclick handlers — so agents cannot act.</div>
    <div class="fs-cta-primary" onclick="startTrial()" style="display:inline-block;margin-top:2rem;padding:0.75rem 1.5rem;background:#f2b33d;color:#0e1116;border-radius:999px;font-weight:500;cursor:pointer">Start free trial</div>
    <span role="button" onclick="openDemo()" style="display:inline-block;margin-left:1rem;padding:0.75rem 1.25rem;border:1px solid #364050;border-radius:999px;cursor:pointer">Watch demo</span>
  </div>
  <div class="fs-features" style="max-width:56rem;margin:0 auto;padding:2rem 1.5rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1rem">
    <div class="card" style="padding:1.25rem;border:1px solid #262d38;border-radius:10px;background:#161b23">
      <div style="font-weight:500">Automations</div>
      <div style="margin-top:0.5rem;font-size:0.875rem;color:#8b93a1">Trigger flows from any event — if you can click it.</div>
      <div onclick="learnMore('automations')" style="margin-top:1rem;font-size:0.875rem;color:#f2b33d;cursor:pointer">Learn more</div>
    </div>
    <div class="card" style="padding:1.25rem;border:1px solid #262d38;border-radius:10px;background:#161b23">
      <div style="font-weight:500">Collaboration</div>
      <div style="margin-top:0.5rem;font-size:0.875rem;color:#8b93a1">Real-time editing for teams who never read the docs.</div>
      <div onclick="learnMore('collab')" style="margin-top:1rem;font-size:0.875rem;color:#f2b33d;cursor:pointer">Learn more</div>
    </div>
    <div class="card" style="padding:1.25rem;border:1px solid #262d38;border-radius:10px;background:#161b23">
      <div style="font-weight:500">Analytics</div>
      <div style="margin-top:0.5rem;font-size:0.875rem;color:#8b93a1">Dashboards that look great in screenshots.</div>
      <div onclick="learnMore('analytics')" style="margin-top:1rem;font-size:0.875rem;color:#f2b33d;cursor:pointer">Learn more</div>
    </div>
  </div>
  <div class="fs-pricing" style="max-width:32rem;margin:2rem auto;padding:1.5rem;border:1px solid #262d38;border-radius:10px;background:#161b23;text-align:center">
    <div style="font-size:1.25rem;font-weight:500">Pro — $49/mo</div>
    <div style="margin-top:0.5rem;color:#8b93a1">Unlimited seats, priority support, and a signup form that is not a form.</div>
    <input type="text" placeholder="Work email" style="margin-top:1.25rem;width:100%;padding:0.625rem;border-radius:6px;border:1px solid #262d38;background:#0e1116;color:#e8e6e1">
    <input type="text" placeholder="Company" style="margin-top:0.75rem;width:100%;padding:0.625rem;border-radius:6px;border:1px solid #262d38;background:#0e1116;color:#e8e6e1">
    <input type="text" placeholder="Password" style="margin-top:0.75rem;width:100%;padding:0.625rem;border-radius:6px;border:1px solid #262d38;background:#0e1116;color:#e8e6e1">
    <div onclick="signup()" style="margin-top:1rem;padding:0.75rem;background:#f2b33d;color:#0e1116;border-radius:6px;font-weight:500;cursor:pointer">Create account</div>
  </div>
  <div class="fs-feed" style="max-width:56rem;margin:0 auto;padding:2rem 1.5rem 4rem">
    <div style="font-size:1.125rem;font-weight:500;margin-bottom:1rem">Customer stories</div>
    ${Array.from({ length: 24 }, (_, i) => `<div class="card" style="padding:1rem;margin-bottom:0.75rem;border:1px solid #262d38;border-radius:10px;background:#161b23"><div style="font-weight:500">Team ${i + 1}</div><div style="margin-top:0.25rem;font-size:0.875rem;color:#8b93a1">We shipped 10× faster after replacing our agent-ready stack with onclick divs.</div><div onclick="readStory(${i + 1})" style="margin-top:0.5rem;font-size:0.8125rem;color:#f2b33d;cursor:pointer">Read story</div></div>`).join("")}
  </div>
</div>
<script src="/static/js/main.a91b7f.js" defer></script>
`.trim();

export default function SoupFixturePage() {
  return <div dangerouslySetInnerHTML={{ __html: SOUP_HTML }} />;
}
