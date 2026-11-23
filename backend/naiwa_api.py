#!/usr/bin/env python3
"""
奶蛙导航站 (nailong.noshower.com) 独立 IP 身份与《合成大奶蛙》排行榜后端 API
- 为每个独立真实访问 IP 随机生成并永久绑定唯一「二次元手游名 + 的 + 角色名」（如：原神的芙宁娜、崩铁的流萤）
- 记录每个独立 IP 的首次/最近访问时间、《合成大奶蛙》最高分、最高合成阶位与游玩局数
- 零第三方依赖（纯 Python 3 标准库 + SQLite WAL 模式）
"""

from __future__ import annotations

import base64
import ipaddress
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

LISTEN_HOST = os.environ.get("NAIWA_API_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("NAIWA_API_PORT", "29808"))
DB_PATH = os.environ.get("NAIWA_DB_PATH", "/var/lib/naiwa-api/players.db")

# 18 款热门二次元手游 × 代表角色池（生成格式严格为：「游戏名的角色名」）
ANIME_GAME_ROSTER: dict[str, list[str]] = {
    "原神": [
        "芙宁娜", "胡桃", "纳西妲", "雷电将军", "钟离", "神里绫华", "那维莱特", "甘雨",
        "八重神子", "刻晴", "宵宫", "仆人", "玛薇卡", "丝柯克", "茜特菈莉", "希诺宁",
        "克洛琳德", "娜维娅", "妮露", "枫原万叶", "流浪者", "可莉", "优菈", "申鹤",
    ],
    "崩铁": [
        "流萤", "卡芙卡", "知更鸟", "黄泉", "三月七", "银狼", "符玄", "镜流",
        "阮梅", "花火", "黑天鹅", "飞霄", "遐蝶", "大黑塔", "星期日", "砂金",
        "饮月", "景元", "停云", "藿藿", "云璃", "灵砂", "缇宝", "白厄",
    ],
    "绝区零": [
        "星见雅", "艾莲", "朱鸢", "简", "青衣", "凯撒", "柏妮思", "月城柳",
        "耀嘉音", "伊芙琳", "妮可", "安比", "猫又", "丽娜", "珂蕾妲", "格莉丝",
        "露西", "派派", "浅羽悠真", "扳机",
    ],
    "鸣潮": [
        "今汐", "长离", "守岸人", "椿", "珂莱塔", "洛可可", "菲比", "赞妮",
        "卡提希娅", "忌炎", "吟霖", "折枝", "相里要", "安可", "维里奈", "秧秧",
        "炽霞", "白芷", "散华", "丹瑾",
    ],
    "明日方舟": [
        "阿米娅", "维什戴尔", "凯尔希", "斯卡蒂", "能天使", "德克萨斯", "拉普兰德", "陈",
        "史尔特尔", "玛恩纳", "黍", "年", "夕", "令", "缪尔赛思", "逻各斯",
        "妮芙", "佩佩", "水月", "银灰", "塞雷娅", "艾雅法拉",
    ],
    "蔚蓝档案": [
        "白子", "星野", "阿露", "日奈", "爱丽丝", "优香", "诺亚", "未花",
        "渚", "圣娅", "梓", "花子", "小春", "伊织", "响", "睦月",
        "佳代子", "桃井", "绿", "心奈", "玛丽",
    ],
    "崩坏3": [
        "爱莉希雅", "琪亚娜", "雷电芽衣", "布洛妮娅", "希儿", "符华", "幽兰戴尔", "丽塔",
        "薇塔", "松雀", "瑟莉姆", "梅比乌斯", "阿波尼亚", "伊甸", "格蕾修", "帕朵菲莉丝",
        "维尔薇", "识之律者",
    ],
    "碧蓝航线": [
        "企业", "柴郡", "信浓", "武藏", "新泽西", "埃吉尔", "大凤", "圣路易斯",
        "贝尔法斯特", "光辉", "独角兽", "拉菲", "标枪", "绫波", "俾斯麦", "阿尔萨斯",
        "云仙", "奇尔沙治",
    ],
    "FGO": [
        "阿尔托莉雅", "摩根", "玛修", "贞德", "伊什塔尔", "艾蕾", "斯卡哈", "梅林",
        "奥伯龙", "阿尔托莉雅Caster", "千子村正", "吉尔伽美什", "远坂凛", "间桐樱",
        "两仪式", "爱尔奎特",
    ],
    "赛马娘": [
        "东海帝皇", "目白麦昆", "特别周", "无声铃鹿", "黄金船", "小栗帽", "米浴", "美浦波旁",
        "曼城茶座", "爱丽速子", "北部玄驹", "里见光钻", "优秀素质", "大和赤骥", "丸善斯基",
    ],
    "重返未来1999": [
        "维尔汀", "十四行诗", "星锑", "槲寄生", "苏芙比", "未锈铠", "牙仙", "曲娘",
        "露西", "卡卡尼亚", "马库斯", "伊索尔德", "维拉", "北方哨歌", "蓝手帕", "梁月",
    ],
    "胜利女神": [
        "拉毗", "阿妮斯", "尼恩", "红莲", "神罚", "桃乐丝", "白雪公主", "爱丽丝",
        "丽塔", "皇冠", "灰姑娘", "普丽瓦蒂", "海伦", "毒蛇",
    ],
    "公主连结": [
        "凯露", "佩可莉姆", "可可萝", "优衣", "日和莉", "怜", "爱梅斯", "克里斯提娜",
        "似似花", "矛依未", "镜华", "伊莉亚", "咲恋", "静流", "真琴", "真步",
    ],
    "战双": [
        "露西亚", "丽芙", "里", "曲", "露娜", "薇拉", "赛琳娜", "比安卡",
        "卡列尼娜", "七实", "阿尔法", "罗塞塔", "含英", "拉弥亚",
    ],
    "尘白禁区": [
        "里芙", "芬妮", "肴", "茉莉安", "芙提雅", "琴诺", "凯茜娅", "苔丝",
        "伊切尔", "安卡希雅", "辰星", "晴", "瑟瑞斯", "恩雅",
    ],
    "阴阳师": [
        "不知火", "阿修罗", "帝释天", "铃鹿御前", "千姬", "紧那罗", "缘结神", "玉藻前",
        "茨木童子", "酒吞童子", "鬼切", "辉夜姬", "彼岸花",
    ],
    "无期迷途": [
        "卓雅", "诺克斯", "兰利", "哈梅尔", "伊琳娜", "瑟琳", "曜", "杜若",
        "德雷雅", "娜恰", "橡木匣", "白逸", "科希", "海拉", "赫卡蒂",
    ],
    "少前2": [
        "闪电", "克罗丽科", "纳美西丝", "寇尔芙", "索米", "玛绮朵", "黛烟", "绛雨",
        "托洛洛", "琼玖", "维普蕾", "春田", "可露凯",
    ],
}

ALL_CANDIDATES: list[tuple[str, str, str]] = [
    (f"{game}的{char}", game, char)
    for game, chars in ANIME_GAME_ROSTER.items()
    for char in chars
]

DB_LOCK = threading.Lock()
LAUGH_BUCKETS: dict[str, tuple[float, float]] = {}
LAUGH_BUCKET_CAP = 40.0
LAUGH_BUCKET_REFILL = 20.0  # tokens/sec per IP
MAX_LAUGH_TOTAL = 99_999_999
MAX_LAUGH_SEED = 5_000


def consume_laugh_tokens(ip_str: str, requested: int) -> tuple[int, bool]:
    """Per-IP token bucket for laugh clicks; called while holding DB_LOCK."""
    if requested <= 0:
        return 0, False
    now = time.monotonic()
    if len(LAUGH_BUCKETS) > 5000:
        stale_before = now - 300.0
        for k in [key for key, (_, ts) in LAUGH_BUCKETS.items() if ts < stale_before]:
            LAUGH_BUCKETS.pop(k, None)
    tokens, last_ts = LAUGH_BUCKETS.get(ip_str, (LAUGH_BUCKET_CAP, now))
    tokens = min(LAUGH_BUCKET_CAP, tokens + max(0.0, now - last_ts) * LAUGH_BUCKET_REFILL)
    accepted = min(requested, int(tokens))
    tokens = max(0.0, tokens - accepted)
    LAUGH_BUCKETS[ip_str] = (tokens, now)
    return accepted, accepted < requested


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_ip(raw_ip: str) -> str:
    val = (raw_ip or "").strip()
    if not val:
        return "127.0.0.1"
    # Strip bracketed IPv6 if present (e.g. [2001:db8::1]:12345)
    if val.startswith("[") and "]" in val:
        val = val[1 : val.index("]")]
    elif val.count(":") == 1 and "." in val:
        val = val.split(":", 1)[0]
    try:
        addr = ipaddress.ip_address(val)
        if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
            return str(addr.ipv4_mapped)
        return addr.compressed
    except ValueError:
        return "127.0.0.1"


ASSET_AVATAR_RE = re.compile(r"^/assets/(?:chars|memes)/[A-Za-z0-9_.-]+\.(?:jpg|jpeg|png|gif|webp)$")
DATA_AVATAR_RE = re.compile(r"^data:image/(webp|png|jpeg|gif);base64,([A-Za-z0-9+/=]+)$")
CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]+")
MAX_CUSTOM_AVATAR_LEN = 96_000


def mask_ip(ip_str: str) -> str:
    """显示前两段，后两段严格隐藏不可见"""
    try:
        addr = ipaddress.ip_address(ip_str)
        if isinstance(addr, ipaddress.IPv4Address):
            parts = ip_str.split(".")
            return f"{parts[0]}.{parts[1]}.*.*"
        hextets = addr.exploded.split(":")
        return f"{hextets[0]}:{hextets[1]}:*:*"
    except ValueError:
        return "*.*.*.*"


def sanitize_player_name(raw_name: str) -> str:
    cleaned = CONTROL_CHARS_RE.sub("", str(raw_name or "")).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:20]


def validate_avatar(raw_avatar: str) -> tuple[bool, str]:
    val = str(raw_avatar or "").strip()
    if val == "":
        return True, ""
    if ASSET_AVATAR_RE.match(val):
        return True, val
    if len(val) > MAX_CUSTOM_AVATAR_LEN:
        return False, "avatar_too_large"
    m = DATA_AVATAR_RE.match(val)
    if not m:
        return False, "invalid_avatar_format"
    fmt, b64_part = m.group(1), m.group(2)
    try:
        raw_bytes = base64.b64decode(b64_part, validate=True)
    except Exception:
        return False, "invalid_avatar_base64"
    if len(raw_bytes) < 16 or len(raw_bytes) > 72_000:
        return False, "invalid_avatar_size"
    if fmt == "png" and not raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return False, "invalid_png"
    if fmt == "jpeg" and not raw_bytes.startswith(b"\xff\xd8\xff"):
        return False, "invalid_jpeg"
    if fmt == "gif" and not (raw_bytes.startswith(b"GIF87a") or raw_bytes.startswith(b"GIF89a")):
        return False, "invalid_gif"
    if fmt == "webp" and not (raw_bytes.startswith(b"RIFF") and raw_bytes[8:12] == b"WEBP"):
        return False, "invalid_webp"
    return True, val


def init_db() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH, timeout=10) as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS players (
                ip TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                init_name TEXT NOT NULL DEFAULT '',
                avatar TEXT NOT NULL DEFAULT '',
                game_name TEXT NOT NULL,
                char_name TEXT NOT NULL,
                best_score INTEGER NOT NULL DEFAULT 0,
                best_tier INTEGER NOT NULL DEFAULT 1,
                games_played INTEGER NOT NULL DEFAULT 0,
                laugh_count INTEGER NOT NULL DEFAULT 0,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL
            );
            """
        )
        # Smooth migration for existing databases
        existing_cols = {
            row[1] for row in conn.execute("PRAGMA table_info(players)").fetchall()
        }
        if "init_name" not in existing_cols:
            conn.execute("ALTER TABLE players ADD COLUMN init_name TEXT NOT NULL DEFAULT '';")
        if "avatar" not in existing_cols:
            conn.execute("ALTER TABLE players ADD COLUMN avatar TEXT NOT NULL DEFAULT '';")
        if "laugh_count" not in existing_cols:
            conn.execute("ALTER TABLE players ADD COLUMN laugh_count INTEGER NOT NULL DEFAULT 0;")
        conn.execute(
            """
            UPDATE players
            SET init_name = CASE
                WHEN game_name != '' AND char_name != '' THEN game_name || '的' || char_name
                ELSE name
            END
            WHERE init_name = '';
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_players_score ON players(best_score DESC, best_tier DESC, last_seen ASC);"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_players_laugh ON players(laugh_count DESC, first_seen ASC);"
        )
        conn.commit()


def pick_random_anime_name(conn: sqlite3.Connection, exclude_name: str = "") -> tuple[str, str, str]:
    used_names = set()
    for r in conn.execute("SELECT name, init_name FROM players").fetchall():
        if r[0]:
            used_names.add(r[0])
        if r[1]:
            used_names.add(r[1])
    if exclude_name:
        used_names.add(exclude_name)

    unused = [c for c in ALL_CANDIDATES if c[0] not in used_names]
    if unused:
        return secrets.choice(unused)

    base_name, game_name, char_name = secrets.choice(ALL_CANDIDATES)
    suffix = secrets.randbelow(90) + 10
    full_name = f"{base_name}{suffix}"
    while full_name in used_names:
        suffix = secrets.randbelow(900) + 100
        full_name = f"{base_name}{suffix}"
    return full_name, game_name, char_name


def get_or_create_player(conn: sqlite3.Connection, ip_str: str) -> sqlite3.Row:
    now = utc_now_iso()
    row = conn.execute("SELECT * FROM players WHERE ip = ?", (ip_str,)).fetchone()
    if row is not None:
        conn.execute("UPDATE players SET last_seen = ? WHERE ip = ?", (now, ip_str))
        conn.commit()
        return conn.execute("SELECT * FROM players WHERE ip = ?", (ip_str,)).fetchone()

    # 初始命名严格遵循原规则：随机分配不重复的「二次元游戏名的角色名」，头像初始为空（默认跟随合成阶位角色）
    full_name, game_name, char_name = pick_random_anime_name(conn)

    conn.execute(
        """
        INSERT INTO players (ip, name, init_name, avatar, game_name, char_name, best_score, best_tier, games_played, laugh_count, first_seen, last_seen)
        VALUES (?, ?, ?, '', ?, ?, 0, 1, 0, 0, ?, ?)
        """,
        (ip_str, full_name, full_name, game_name, char_name, now, now),
    )
    conn.commit()
    return conn.execute("SELECT * FROM players WHERE ip = ?", (ip_str,)).fetchone()


def build_state_payload(conn: sqlite3.Connection, me: sqlite3.Row) -> dict:
    total_players = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    total_laughs = conn.execute("SELECT COALESCE(SUM(laugh_count), 0) FROM players").fetchone()[0]
    laugh_ranked_players = conn.execute(
        "SELECT COUNT(*) FROM players WHERE laugh_count > 0"
    ).fetchone()[0]

    my_score = int(me["best_score"])
    if my_score > 0:
        better = conn.execute(
            """
            SELECT COUNT(*) FROM players
            WHERE best_score > ?
               OR (best_score = ? AND best_tier > ?)
            """,
            (my_score, my_score, int(me["best_tier"])),
        ).fetchone()[0]
        rank = int(better) + 1
    else:
        rank = None

    my_laughs = int(me["laugh_count"])
    if my_laughs > 0:
        better_laugh = conn.execute(
            """
            SELECT COUNT(*) FROM players
            WHERE laugh_count > ?
               OR (laugh_count = ? AND (first_seen < ? OR (first_seen = ? AND ip < ?)))
            """,
            (my_laughs, my_laughs, me["first_seen"], me["first_seen"], me["ip"]),
        ).fetchone()[0]
        laugh_rank = int(better_laugh) + 1
    else:
        laugh_rank = None

    top_rows = conn.execute(
        """
        SELECT ip, name, init_name, avatar, game_name, char_name, best_score, best_tier, games_played, laugh_count, last_seen
        FROM players
        ORDER BY best_score DESC, best_tier DESC, first_seen ASC
        LIMIT 50
        """
    ).fetchall()

    leaderboard = [
        {
            "rank": idx + 1,
            "name": r["name"],
            "avatar": r["avatar"] or "",
            "maskedIp": mask_ip(r["ip"]),
            "game": r["game_name"],
            "char": r["char_name"],
            "bestScore": int(r["best_score"]),
            "bestTier": int(r["best_tier"]),
            "gamesPlayed": int(r["games_played"]),
            "laughCount": int(r["laugh_count"]),
            "isMe": r["ip"] == me["ip"],
        }
        for idx, r in enumerate(top_rows)
    ]

    top_laugh_rows = conn.execute(
        """
        SELECT ip, name, init_name, avatar, game_name, char_name, best_score, best_tier, games_played, laugh_count, first_seen, last_seen
        FROM players
        WHERE laugh_count > 0
        ORDER BY laugh_count DESC, first_seen ASC, ip ASC
        LIMIT 50
        """
    ).fetchall()

    laugh_leaderboard = [
        {
            "rank": idx + 1,
            "name": r["name"],
            "avatar": r["avatar"] or "",
            "maskedIp": mask_ip(r["ip"]),
            "game": r["game_name"],
            "char": r["char_name"],
            "bestScore": int(r["best_score"]),
            "bestTier": int(r["best_tier"]),
            "laughCount": int(r["laugh_count"]),
            "isMe": r["ip"] == me["ip"],
        }
        for idx, r in enumerate(top_laugh_rows)
    ]

    init_name = me["init_name"] or (
        f"{me['game_name']}的{me['char_name']}" if me["game_name"] and me["char_name"] else me["name"]
    )

    return {
        "ok": True,
        "player": {
            "name": me["name"],
            "initName": init_name,
            "avatar": me["avatar"] or "",
            "game": me["game_name"],
            "char": me["char_name"],
            "maskedIp": mask_ip(me["ip"]),
            "bestScore": my_score,
            "bestTier": int(me["best_tier"]),
            "gamesPlayed": int(me["games_played"]),
            "laughCount": my_laughs,
            "rank": rank,
            "laughRank": laugh_rank,
        },
        "totalPlayers": int(total_players),
        "totalLaughs": int(total_laughs),
        "laughRankedPlayers": int(laugh_ranked_players),
        "leaderboard": leaderboard,
        "laughLeaderboard": laugh_leaderboard,
    }


class NaiwaAPIHandler(BaseHTTPRequestHandler):
    server_version = "NaiwaAPI/1.2"

    def log_message(self, fmt: str, *args) -> None:
        return

    def extract_client_ip(self) -> str:
        # Trusted local Caddy injects X-Real-Client-IP from PROXY protocol socket address
        hdr_ip = self.headers.get("X-Real-Client-IP", "").strip()
        if hdr_ip:
            return normalize_ip(hdr_ip)
        return normalize_ip(self.client_address[0])

    def send_json(self, status: int, data: dict) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path not in ("/api/naiwa/me", "/api/naiwa/leaderboard", "/api/naiwa/random-name", "/api/naiwa/health"):
            self.send_json(404, {"ok": False, "error": "not_found"})
            return

        if path == "/api/naiwa/health":
            self.send_json(200, {"ok": True, "poolSize": len(ALL_CANDIDATES)})
            return

        client_ip = self.extract_client_ip()
        with DB_LOCK, sqlite3.connect(DB_PATH, timeout=10) as conn:
            conn.row_factory = sqlite3.Row
            me = get_or_create_player(conn, client_ip)
            if path == "/api/naiwa/random-name":
                cand_name, cand_game, cand_char = pick_random_anime_name(conn, exclude_name=me["name"])
                self.send_json(200, {"ok": True, "name": cand_name, "game": cand_game, "char": cand_char})
                return
            payload = build_state_payload(conn, me)
        self.send_json(200, payload)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in ("/api/naiwa/score", "/api/naiwa/profile", "/api/naiwa/laugh"):
            self.send_json(404, {"ok": False, "error": "not_found"})
            return

        max_body = 131_072 if path == "/api/naiwa/profile" else 8192
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > max_body:
            self.send_json(400, {"ok": False, "error": "bad_body"})
            return

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self.send_json(400, {"ok": False, "error": "invalid_json"})
            return

        if not isinstance(body, dict):
            self.send_json(400, {"ok": False, "error": "invalid_json"})
            return

        client_ip = self.extract_client_ip()
        now = utc_now_iso()

        if path == "/api/naiwa/profile":
            with DB_LOCK, sqlite3.connect(DB_PATH, timeout=10) as conn:
                conn.row_factory = sqlite3.Row
                me = get_or_create_player(conn, client_ip)

                new_name = me["name"]
                new_avatar = me["avatar"] or ""

                if "name" in body:
                    cleaned = sanitize_player_name(body.get("name", ""))
                    if not cleaned:
                        self.send_json(400, {"ok": False, "error": "empty_name", "message": "名字不能为空（1~20 个字符）"})
                        return
                    new_name = cleaned

                if "avatar" in body:
                    ok_av, res_av = validate_avatar(body.get("avatar", ""))
                    if not ok_av:
                        self.send_json(400, {"ok": False, "error": res_av, "message": "头像格式不支持或体积过大"})
                        return
                    new_avatar = res_av

                conn.execute(
                    """
                    UPDATE players
                    SET name = ?, avatar = ?, last_seen = ?
                    WHERE ip = ?
                    """,
                    (new_name, new_avatar, now, client_ip),
                )
                conn.commit()
                me = conn.execute("SELECT * FROM players WHERE ip = ?", (client_ip,)).fetchone()
                payload = build_state_payload(conn, me)

            self.send_json(200, payload)
            return

        if path == "/api/naiwa/laugh":
            try:
                raw_delta = int(body.get("delta", 0))
                raw_seed = int(body.get("localSeed", 0))
            except (TypeError, ValueError):
                self.send_json(400, {"ok": False, "error": "invalid_fields"})
                return

            req_delta = max(0, min(30, raw_delta))
            req_seed = max(0, min(MAX_LAUGH_SEED, raw_seed))

            with DB_LOCK, sqlite3.connect(DB_PATH, timeout=10) as conn:
                conn.row_factory = sqlite3.Row
                me = get_or_create_player(conn, client_ip)
                cur_laughs = int(me["laugh_count"])

                accepted_delta, rate_limited = consume_laugh_tokens(client_ip, req_delta)
                seed_applied = req_seed if (cur_laughs == 0 and req_seed > 0) else 0
                new_laughs = min(MAX_LAUGH_TOTAL, cur_laughs + seed_applied + accepted_delta)

                if new_laughs != cur_laughs:
                    conn.execute(
                        """
                        UPDATE players
                        SET laugh_count = ?, last_seen = ?
                        WHERE ip = ?
                        """,
                        (new_laughs, now, client_ip),
                    )
                    conn.commit()
                    me = conn.execute("SELECT * FROM players WHERE ip = ?", (client_ip,)).fetchone()

                payload = build_state_payload(conn, me)
                payload["acceptedDelta"] = accepted_delta + seed_applied
                payload["rateLimited"] = rate_limited

            self.send_json(200, payload)
            return

        # /api/naiwa/score
        try:
            score = int(body.get("score", 0))
            max_tier = int(body.get("maxTier", 1))
            is_final = bool(body.get("final", False))
        except (TypeError, ValueError):
            self.send_json(400, {"ok": False, "error": "invalid_fields"})
            return

        # Sanity clamp
        score = max(0, min(500_000, score))
        max_tier = max(1, min(11, max_tier))

        with DB_LOCK, sqlite3.connect(DB_PATH, timeout=10) as conn:
            conn.row_factory = sqlite3.Row
            me = get_or_create_player(conn, client_ip)
            new_best_score = max(int(me["best_score"]), score)
            new_best_tier = max(int(me["best_tier"]), max_tier)
            new_games = int(me["games_played"]) + (1 if is_final else 0)
            conn.execute(
                """
                UPDATE players
                SET best_score = ?, best_tier = ?, games_played = ?, last_seen = ?
                WHERE ip = ?
                """,
                (new_best_score, new_best_tier, new_games, now, client_ip),
            )
            conn.commit()
            me = conn.execute("SELECT * FROM players WHERE ip = ?", (client_ip,)).fetchone()
            payload = build_state_payload(conn, me)

        self.send_json(200, payload)


def main() -> None:
    init_db()
    srv = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), NaiwaAPIHandler)
    print(f"[naiwa-api] listening on {LISTEN_HOST}:{LISTEN_PORT}, db={DB_PATH}, pool={len(ALL_CANDIDATES)}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
