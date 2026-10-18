"""
Gera data/catalog.json e data/icons.json a partir dos arquivos do Idle Slayer instalado.

Rode de novo depois de uma atualização do jogo para pegar itens novos:
    python -m venv .venv
    .venv\\Scripts\\pip install UnityPy
    .venv\\Scripts\\python tools\\extrair_catalogo.py ["C:\\caminho\\Idle Slayer_Data"]
"""
import base64
import csv
import glob
import io
import json
import os
import re
import struct
import sys
from datetime import date

import UnityPy

GAME_DATA = sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\Steam\steamapps\common\Idle Slayer\Idle Slayer_Data"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

ID_RE = re.compile(rb"\x14\x00\x00\x00([a-z0-9]{20})")
TAG_RE = re.compile(r"<[^>]+>")

# Enum QuestType do jogo (valores 0..33, lidos de il2cpp_data/Metadata/global-metadata.dat na v7.3.4),
# já convertido para o sufixo da chave de tradução "quest_type_<x>". Tipos novos costumam entrar no fim.
QUEST_TYPES = [
    "kill_enemies", "pick_up_coins", "pick_up_rubies", "kill_enemies_with_arrows", "pick_up_sapphires",
    "kill_flyers", "pick_up_emeralds", "land_criticals", "hit_random_boxes", "hit_silver_random_boxes",
    "kill_giants", "kill_with_rage_mode", "boost", "craft_temporary_items", "chest_hunt_chests",
    "complete_bonus_stage", "complete_bonus_stage_sections", "get_materials", "pick_up_gemstones",
    "kill_enemies_with_character", "kill_enemies_of_type", "find_armory_items", "get_coins_from_random_box",
    "take_portal", "complete_daily_quests", "kill_shinies", "pick_up_diamonds", "wind_dash_kills",
    "dig_dig_piles", "use_rage_mode", "complete_ascending_heights", "pick_up_zyniums",
    "hit_golden_random_boxes", "complete_grapple_runs",
]


def read_str(raw, pos):
    if pos + 4 > len(raw):
        return None, pos
    n = struct.unpack_from("<i", raw, pos)[0]
    if not 0 <= n <= 300 or pos + 4 + n > len(raw):
        return None, pos
    s = raw[pos + 4:pos + 4 + n]
    return s.decode("utf-8", "replace"), (pos + 4 + n + 3) & ~3


def load_lang(code):
    files = glob.glob(os.path.join(GAME_DATA, "StreamingAssets", "aa", "StandaloneWindows64", f"lang{code}_*.bundle"))
    if not files:
        return {}
    env = UnityPy.load(files[0])
    for o in env.objects:
        if o.type.name == "TextAsset":
            s = o.read().m_Script
            text = s if isinstance(s, str) else bytes(s).decode("utf-8", "replace")
            return {row[0]: row[1] for row in csv.reader(io.StringIO(text)) if len(row) >= 2}
    return {}


def clean(text):
    if not text:
        return ""
    text = text.replace("<br>", " ").replace("\\n", " ")
    return re.sub(r"\s+", " ", TAG_RE.sub("", text)).strip()


def main():
    lang = load_lang("pt-br")
    env = UnityPy.load(os.path.join(GAME_DATA, "resources.assets"))
    sprites = {o.path_id: o for o in env.objects if o.type.name == "Sprite"}
    items, icons = {}, {}
    objects = []  # (item_id, raw, fim do ID) para a segunda passada

    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        raw = o.get_raw_data()
        m = ID_RE.search(raw[:150])
        if not m:
            continue
        try:
            d = o.read(check_read=False)
            name = d.m_Name
            cls = d.m_Script.read().m_ClassName
        except Exception:
            continue
        if m.start() > len(name) + 80:
            continue
        item_id = m.group(1).decode()
        if item_id in items:
            continue

        # Depois do ID vem a chave de tradução e (às vezes) a chave da descrição.
        loc_key, pos = read_str(raw, m.end())
        desc_key, _ = read_str(raw, pos) if loc_key is not None else (None, pos)
        if not desc_key or not desc_key.endswith("_description"):
            desc_key = (loc_key or "") + "_description"

        entry = {"c": cls, "n": name}
        if loc_key and lang.get(loc_key):
            entry["pt"] = clean(lang[loc_key])
        if lang.get(desc_key):
            entry["d"] = clean(lang[desc_key])
        items[item_id] = entry
        objects.append((o.path_id, item_id, raw, m.end()))

        # Ícone: primeira referência a um Sprite do mesmo arquivo.
        for p in range(m.end(), len(raw) - 12, 4):
            fid, pid = struct.unpack_from("<iq", raw, p)
            if fid == 0 and pid in sprites:
                try:
                    img = sprites[pid].read().image
                    buf = io.BytesIO()
                    img.save(buf, "PNG", optimize=True)
                    icons[item_id] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
                except Exception:
                    pass
                break

    # Efeitos: o item referencia objetos NewBenefit (texto com {0}) seguidos do valor em double.
    # Missões (classe Quest): name, description, sprite, questType, enemyToKill, questGoal, unlocksUpgrade,
    # bundleRequired, characterRequired, enemyType, isClaimed, fromCollab, mapEvent, eventSet.
    by_pid = {pid: iid for pid, iid, _, _ in objects}
    all_objs = {o.path_id: o for o in env.objects}
    events = {}

    def ref(raw, p):
        return by_pid.get(struct.unpack_from("<q", raw, p)[0]) if p + 8 <= len(raw) else None

    def label(item_id, default):
        return items[item_id].get("pt", items[item_id]["n"]) if item_id in items else default

    def map_event(pid):
        o = all_objs.get(pid)
        if not o or o.type.name != "MonoBehaviour":
            return None
        m = re.search(rb"event_[a-z0-9_]+", o.get_raw_data())
        if not m:
            return None
        ev = m.group(0).decode()
        events.setdefault(ev, clean(lang.get(ev, ev)))
        return ev

    for _, item_id, raw, end in objects:
        if items[item_id]["c"] not in ("Quest", "DailyQuest", "WeeklyQuest"):
            continue
        _, p = read_str(raw, end)       # name (chave de tradução)
        _, p = read_str(raw, p)         # description
        if p + 32 > len(raw):
            continue
        qtype = struct.unpack_from("<i", raw, p + 12)[0]
        goal = struct.unpack_from("<i", raw, p + 28)[0]
        items[item_id]["q"] = [qtype, goal]
        bundle = ref(raw, p + 48)
        if bundle:
            items[item_id]["qb"] = bundle
        # Missões de evento apontam para um MapEvent; o número seguinte é a parte (eventSet) do evento.
        for q in range(p + 80, min(len(raw) - 12, p + 120), 4):
            fid, pid = struct.unpack_from("<iq", raw, q)
            ev = map_event(pid) if fid == 0 and pid > 0 else None
            if ev:
                items[item_id]["qe"] = [ev, struct.unpack_from("<i", raw, q + 12)[0]]
                break

        key = QUEST_TYPES[qtype] if 0 <= qtype < len(QUEST_TYPES) else None
        template = lang.get(f"quest_type_{key}") or ("Cave {0} montes." if key == "dig_dig_piles" else None)
        if template:
            enemy = label(ref(raw, p + 20), "inimigos")
            if key == "kill_enemies_of_type":
                enemy = label(ref(raw, p + 72), "…")
            text = (template.replace("{0}", f"{goal:,}".replace(",", "."))
                    .replace("{1}", enemy).replace("{2}", label(ref(raw, p + 60), "…")))
            items[item_id].setdefault("d", clean(text))

    benefits = {pid: iid for pid, iid, _, _ in objects if items[iid]["c"] == "NewBenefit"}
    skills = {pid: iid for pid, iid, _, _ in objects if items[iid]["c"] == "WeaponItemSkill"}
    for _, item_id, raw, end in objects:
        effects, pool, skill_pool = [], [], []
        for p in range(end, len(raw) - 20, 4):
            fid, pid = struct.unpack_from("<iq", raw, p)
            if fid == 0 and pid in skills:
                skill_pool.append(skills[pid])
            if fid != 0 or pid not in benefits:
                continue
            text = items[benefits[pid]].get("pt")
            value = struct.unpack_from("<d", raw, p + 12)[0]
            # valor 0 = o {0} do texto é um nome preenchido em tempo de jogo, não um número
            shown = "…" if value == 0 else f"{value:g}".replace(".", ",") if abs(value) < 1e15 else f"{value:.3g}"
            if benefits[pid] not in (b[0] for b in pool):
                pool.append([benefits[pid], shown])
            if text:
                effects.append(text.replace("{0}", shown).replace("{1}", "…").replace("{2}", "…"))
        if effects and items[item_id]["c"] != "NewBenefit":
            items[item_id]["e"] = " • ".join(dict.fromkeys(effects))
        # Armas do Arsenal: guardam no save quais benefícios/habilidades do conjunto possível foram sorteados.
        if items[item_id]["c"] in ("WeaponItem", "KeyWeaponItem"):
            items[item_id]["b"] = pool
            if skill_pool:
                items[item_id]["s"] = list(dict.fromkeys(skill_pool))

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": date.today().isoformat(), "events": events, "items": items},
                  f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "icons.json"), "w", encoding="utf-8") as f:
        json.dump(icons, f, separators=(",", ":"))
    print(f"{len(items)} itens, {len(icons)} ícones -> {os.path.abspath(OUT)}")


if __name__ == "__main__":
    main()
