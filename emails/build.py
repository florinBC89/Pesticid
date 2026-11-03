#!/usr/bin/env python3
"""Generează cele 4 emailuri de bun venit din template.html + variants.json.

  python3 build.py                       -> out/welcome-<id>.html (assets relative: ../assets)
  python3 build.py --assets-url URL      -> același lucru, cu URL absolut la imagini (pentru Resend)
  python3 build.py --out DIR --assets-url assets

Tokenii {{cheie}} din template sunt înlocuiți cu valorile din "config" + varianta.
<b>…</b> din texte devine <strong> cu stil inline (email-safe).
"""
import argparse, json, pathlib, re

HERE = pathlib.Path(__file__).parent
FONT = "Arial,Helvetica,sans-serif"

def strong(html: str, color="#111111") -> str:
    return (html.replace("<b>", f'<strong style="font-weight:600;color:{color};">')
                .replace("</b>", "</strong>"))

def bullet_rows(items):
    rows = []
    for t in items:
        rows.append(
            '        <tr>'
            '<td width="22" valign="top" style="padding:5px 10px 5px 0;">'
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            '<td width="22" height="22" align="center" valign="middle" bgcolor="#ceee58" '
            f'style="background-color:#ceee58;border-radius:11px;font-family:{FONT};font-size:12px;line-height:22px;font-weight:600;color:#111111;">&#10003;</td>'
            '</tr></table></td>'
            f'<td valign="top" style="padding:5px 0;font-family:{FONT};font-size:16px;line-height:24px;font-weight:400;color:#111111;">{strong(t)}</td>'
            '</tr>')
    return "\n".join(rows)

def render(template: str, data: dict, bullets: dict, cfg: dict) -> str:
    v = dict(cfg); v.update(data)
    v["bullets"] = bullet_rows(bullets[data["bullets"]])
    for k in ("intro", "second_headline", "second_text", "offer_calc"):
        v[k] = strong(v[k])
    def sub(m):
        key = m.group(1)
        if key not in v:
            raise KeyError(f"token necunoscut în template: {key}")
        return str(v[key])
    out = re.sub(r"\{\{(\w+)\}\}", sub, template)
    # unsubscribe_url poate conține {{email}} -> a doua trecere
    return re.sub(r"\{\{(\w+)\}\}", sub, out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--assets-url", default="../assets")
    ap.add_argument("--site-url"); ap.add_argument("--email")
    a = ap.parse_args()
    spec = json.loads((HERE / "variants.json").read_text(encoding="utf-8"))
    cfg = spec["config"]; cfg["assets_url"] = a.assets_url
    if a.site_url: cfg["site_url"] = a.site_url
    if a.email: cfg["email"] = a.email
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for var in spec["variants"]:
        html = render(tpl, var, spec["bullets"], cfg)
        p = out / f"welcome-{var['id']}.html"
        p.write_text(html, encoding="utf-8")
        print(f"{p}  {len(html.encode())/1024:.1f} KB  subject: {var['subject']}")

if __name__ == "__main__":
    main()
