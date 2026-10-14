import os
import sys
import re
import json
import socket
import sqlite3
import datetime
import threading
import subprocess
from typing import Set

# Ensure utf-8 output on Windows console
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import tornado.ioloop
import tornado.web
import tornado.websocket

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "upanayan.db")
STATIC_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
CLOUDFLARED_EXE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloudflared.exe")

PUBLIC_URL = None
cloudflared_proc = None

def start_cloudflared(port=8000):
    global PUBLIC_URL, cloudflared_proc
    if not os.path.exists(CLOUDFLARED_EXE):
        return
    try:
        cloudflared_proc = subprocess.Popen(
            [CLOUDFLARED_EXE, "tunnel", "--url", f"http://127.0.0.1:{port}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding='utf-8',
            errors='ignore'
        )
        for line in cloudflared_proc.stderr:
            m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
            if m:
                PUBLIC_URL = m.group(0)
                print(f"🌍 ઇન્ટરનેટ પબ્લિક લિંક (Mobile Data / Anywhere): {PUBLIC_URL}")
                break
    except Exception as e:
        print(f"Tunnel launch note: {e}")


def get_local_ip():
    """Detect local LAN IP for mobile network access"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # Settings table
    c.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # Programs / Muhurat table
    c.execute("""
    CREATE TABLE IF NOT EXISTS programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        title_en TEXT,
        date TEXT,
        muhurat_time TEXT,
        venue TEXT,
        priest_incharge TEXT,
        notes TEXT,
        status TEXT DEFAULT 'upcoming',
        sort_order INTEGER DEFAULT 0
    )
    """)

    # Tasks / Checklist table
    c.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT DEFAULT 'જનરલ',
        assigned_to TEXT,
        priority TEXT DEFAULT 'મધ્યમ',
        due_date TEXT,
        reminder_time TEXT,
        is_completed INTEGER DEFAULT 0,
        completed_at TEXT,
        completed_by TEXT
    )
    """)

    # Expenses table
    c.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL DEFAULT 0,
        estimated_amount REAL DEFAULT 0,
        paid_by TEXT,
        payment_status TEXT DEFAULT 'બાકી',
        payment_mode TEXT DEFAULT 'રોકડ',
        notes TEXT,
        date TEXT
    )
    """)

    # Contacts table
    c.execute("""
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        category TEXT DEFAULT 'સેવા',
        phone TEXT,
        alt_phone TEXT,
        notes TEXT,
        address TEXT
    )
    """)

    # Shagun / Chandalo table
    c.execute("""
    CREATE TABLE IF NOT EXISTS shagun (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        relation TEXT,
        village TEXT,
        amount REAL DEFAULT 0,
        gift_description TEXT,
        date TEXT,
        notes TEXT
    )
    """)

    # Samagri table
    c.execute("""
    CREATE TABLE IF NOT EXISTS samagri (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        item_name_en TEXT,
        quantity TEXT,
        category TEXT DEFAULT 'પૂજા',
        is_arranged INTEGER DEFAULT 0,
        arranged_by TEXT
    )
    """)

    # Activity log table
    c.execute("""
    CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT,
        action_type TEXT,
        description TEXT,
        timestamp TEXT
    )
    """)

    conn.commit()

    # Seed initial data if empty
    c.execute("SELECT COUNT(*) as count FROM settings")
    if c.fetchone()["count"] == 0:
        seed_data(conn)
    
    conn.close()

def seed_data(conn):
    c = conn.cursor()
    # Default settings
    default_settings = [
        ("boy_name", "ચિ. આરવ (Aarav)"),
        ("father_name", "રાજેશભાઈ પટેલ"),
        ("mother_name", "ભાવનાબેન પટેલ"),
        ("event_date", "2026-11-22"),
        ("venue", "શ્રી ઉમિયા માતાજી વાડી, અમદાવાદ"),
        ("budget_target", "350000"),
        ("app_theme", "vedic_gold")
    ]
    for k, v in default_settings:
        c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v))

    # Pre-seeded Upanayan Programs
    programs = [
        ("મંડપ મુહૂર્ત અને ગણેશ પૂજન", "Mandap Mahurat & Ganesh Pujan", "2026-11-21", "સવારે ૦૮:૧૫ થી ૦૯:૩૦", "નિવાસ સ્થાન (આંગણું)", "શાસ્ત્રીજી હરેશભાઈ", "પ્રથમ પૂજ્ય ગણપતિ આરાધના અને મંડપ રોપણ વિધિ.", "upcoming", 1),
        ("માતૃકા પૂજન અને નાંદી શ્રાદ્ધ", "Matruka Pujan & Nandi Shraddh", "2026-11-21", "સવારે ૧૦:૦૦ થી ૧૧:૩૦", "પૂજા ખંડ", "શાસ્ત્રીજી હરેશભાઈ", "કુળદેવી આરાધના અને પિતૃ આશીર્વાદ.", "upcoming", 2),
        ("ગ્રહશાંતિ અને હોમાત્મક હવન", "Grah Shanti & Sacred Havan", "2026-11-21", "બપોરે ૦૩:૦૦ થી ૦૫:૩૦", "ઉમિયા વાડી હવન કુંડ", "શાસ્ત્રીજી હરેશભાઈ", "નવગ્રહ શાંતિ અને પવિત્ર હવન.", "upcoming", 3),
        ("ક્ષૌર સંસ્કાર (ચૌલ કર્મ / બાબરી)", "Chaul Karma (Babari)", "2026-11-22", "સવારે ૦૬:૩૦ થી ૦૭:૩૦", "ઉમિયા વાડી", "ગોવિંદભાઈ વાણંદ", "બ્રહ્મચારી કુમારનું ક્ષૌર કર્મ અને પવિત્ર સ્નાન.", "upcoming", 4),
        ("યજ્ઞોપવીત ધારણ અને ગાયત્રી મંત્ર દીક્ષા", "Yagnopavita & Gayatri Diksha", "2026-11-22", "સવારે ૦૮:૩૦ થી ૧૦:૦૦", "મુખ્ય સભા મંડપ", "શાસ્ત્રીજી હરેશભાઈ", "પવિત્ર જનોઈ ધારણ, અજિન ધારણ, દંડ ધારણ અને પિતાશ્રી દ્વારા ગાયત્રી મંત્ર દીક્ષા.", "upcoming", 5),
        ("ભિક્ષાવળ વિધિ (માતૃ-પિતૃ ભિક્ષા) અને કાશી યાત્રા", "Bhiksha Ceremony & Kashi Yatra", "2026-11-22", "સવારે ૧૦:૧૫ થી ૧૧:૩૦", "મંડપ પરિસર", "પરિવારજનો / મામાશ્રી", "કુમાર ભિક્ષા માંગે છે અને મામા કાશી જતાં અટકાવી ભણાવવા પાછા લાવે છે.", "upcoming", 6),
        ("સમાવર્તન અને મહાપ્રસાદ (ભોજન સમારંભ)", "Samavartan & Grand Feast", "2026-11-22", "બપોરે ૧૨:૦૦ થી ૦૩:૦૦", "ડાઇનિંગ હોલ", "સમસ્ત પરિવાર", "બધા આમંત્રિત મહેમાનો માટે મહાપ્રસાદ.", "upcoming", 7)
    ]
    for p in programs:
        c.execute("""
        INSERT INTO programs (title, title_en, date, muhurat_time, venue, priest_incharge, notes, status, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, p)

    # Pre-seeded Tasks
    tasks = [
        ("ગોર મહારાજ (શાસ્ત્રીજી) સાથે વિધિ અને મુહૂર્ત નક્કી કરવા", "પૂજા વિધિ", "પપ્પા", "ઉચ્ચ", "2026-10-25", "10:00", 1, "2026-10-14 10:00", "રાજેશભાઈ"),
        ("વાડી/હોલ બુકિંગ અને એડવાન્સ ચૂકવણી", "સ્થળ વ્યવસ્થા", "દિલીપ કાકા", "ઉચ્ચ", "2026-10-28", "11:00", 1, "2026-10-14 11:30", "દિલીપભાઈ"),
        ("કેટરર્સ સાથે મેનુ ફાઇનલ કરવું (લાડુ, દાળ-ભાત, શાક, ફરસાણ)", "કેટરિંગ", "હિતેશ મામા", "ઉચ્ચ", "2026-11-05", "15:00", 0, None, None),
        ("જનોઈ પૂજા સામગ્રી (સુતરની જનોઈ, દર્ભાસન, કમંડળ, મૃગચર્મ)", "સામગ્રી", "ભાવનાબેન", "મધ્યમ", "2026-11-10", "16:00", 0, None, None),
        ("કુમાર માટે પીળો ખેસ, ધોતી-કુર્તો, લાકડી, ખડાઉ (ચાખડી) ખરીદવી", "ખરીદી", "રાજેશભાઈ", "ઉચ્ચ", "2026-11-12", "12:00", 0, None, None),
        ("આમંત્રણ પત્રિકા પ્રિન્ટિંગ અને વોટ્સએપ પર શેર કરવી", "આમંત્રણ", "મિત્ર કલ્પેશ", "મધ્યમ", "2026-11-01", "10:00", 0, None, None),
        ("ફોટોગ્રાફર અને વીડિયોગ્રાફર બુક કરવા", "મીડિયા", "સચિન ભાઈ", "મધ્યમ", "2026-11-08", "18:00", 0, None, None),
        ("ભિક્ષાવળ માટે મીઠાઈ અને ભેટની તૈયારી કરવી", "વિધિ તૈયારી", "કાકી સુશીલાબેન", "સામાન્ય", "2026-11-18", "14:00", 0, None, None),
        ("સાઉન્ડ સિસ્ટમ અને શરણાઈ/ઢોલ વાળા નક્કી કરવા", "સંગીત", "મિત્ર કલ્પેશ", "સામાન્ય", "2026-11-15", "17:00", 0, None, None),
        ("પાવન સ્નાન માટે પંચગવ્ય અને ગંગાજળની વ્યવસ્થા", "પૂજા વિધિ", "શાસ્ત્રીજી", "ઉચ્ચ", "2026-11-20", "09:00", 0, None, None)
    ]
    for t in tasks:
        c.execute("""
        INSERT INTO tasks (title, category, assigned_to, priority, due_date, reminder_time, is_completed, completed_at, completed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, t)

    # Pre-seeded Expenses
    expenses = [
        ("શ્રી ઉમિયા માતાજી વાડી એડવાન્સ", "હોલ/વાડી", 35000, 35000, "રાજેશભાઈ", "ચુકવાઈ ગયું", "UPI", "રિસીપ્ટ નં. 402", "2026-10-10"),
        ("કેટરર્સ એડવાન્સ (શ્રી રાધે કેટરર્સ)", "ભોજન/કેટરિંગ", 50000, 160000, "રાજેશભાઈ", "ભાગશઃ ચૂકવણી", "બેંક ટ્રાન્સફર", "મેનુ ફાઇનલ બાકી", "2026-10-12"),
        ("શાસ્ત્રીજી પૂજા દક્ષિણા એડવાન્સ", "પૂજા/મહારાજ", 5000, 21000, "દિલીપ કાકા", "ચુકવાઈ ગયું", "રોકડ", "હવન અને જનોઈ સામગ્રી સહિત", "2026-10-14"),
        ("કુમારના વસ્ત્રો (ધોતી, કુર્તા, ખેસ, ખડાઉ)", "કપડાં/વસ્ત્રો", 12500, 15000, "ભાવનાબેન", "ચુકવાઈ ગયું", "કાર્ડ", "પરંપરાગત રેશમી વસ્ત્રો", "2026-10-13"),
        ("ફોટોગ્રાફી અને સિનેમેટિક વીડિયો", "ફોટો-વીડિયો", 10000, 35000, "રાજેશભાઈ", "બાકી", "UPI", "ડ્રોન શૂટિંગ સાથે", "2026-11-01"),
        ("મંડપ અને સ્ટેજ ડેકોરેશન", "ડેકોરેશન", 0, 45000, "હિતેશ મામા", "બાકી", "રોકડ", "ઓરિજિનલ ફૂલોથી શણગાર", "2026-11-15"),
        ("આમંત્રણ પત્રિકા અને ડ્રાયફ્રૂટ્સ બોક્સ", "આમંત્રણ", 8500, 12000, "રાજેશભાઈ", "ચુકવાઈ ગયું", "રોકડ", "150 પત્રિકાઓ", "2026-10-11")
    ]
    for e in expenses:
        c.execute("""
        INSERT INTO expenses (title, category, amount, estimated_amount, paid_by, payment_status, payment_mode, notes, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, e)

    # Pre-seeded Contacts
    contacts = [
        ("શાસ્ત્રીજી હરેશભાઈ વ્યાસ", "મુખ્ય ગોર મહારાજ", "પૂજા વિધિ", "9825012345", "079-26851122", "સંપૂર્ણ જનોઈ વિધિના પ્રકાંડ વિદ્વાન", "શાહીબાગ, અમદાવાદ"),
        ("શ્રી રાધે કેટરર્સ (મુકેશભાઈ)", "મુખ્ય કેટરર્સ / રસોઈયા", "કેટરિંગ", "9879054321", "9426011223", "શુદ્ધ દેશી ઘીની વાનગીઓ અને ગુજરાતી થાળી", "નિકોલ, અમદાવાદ"),
        ("શ્રી ઉમિયા વાડી મેનેજર (જયંતિભાઈ)", "વાડી સંચાલક", "સ્થળ વ્યવસ્થા", "9428098765", "", "રૂમ અને હોલની ચાવીઓ માટે સંપર્ક", "ઘાટલોડિયા, અમદાવાદ"),
        ("મેમરીઝ સ્ટુડિયો (ભાવેશભાઈ)", "મુખ્ય ફોટોગ્રાફર", "ફોટો-વીડિયો", "9909067890", "", "ડ્રોન, કેન્ડિડ ફોટોગ્રાફી અને આલ્બમ", "સી.જી. રોડ, અમદાવાદ"),
        ("ગોવિંદભાઈ વાણંદ", "ક્ષૌર કર્મ (ચૌલ)", "સેવા", "9724034567", "", "સવારે ૦૬:૩૦ વાગે સમયસર પહોંચશે", "જૂના વાડજ"),
        ("શ્રીનાથજી મંડપ સર્વિસ (અશોકભાઈ)", "મંડપ અને સાઉન્ડ", "ડેકોરેશન", "9898011234", "", "મંડપ, લાઈટીંગ અને સાઉન્ડ સિસ્ટમ", "મેમનગર, અમદાવાદ"),
        ("દિલીપભાઈ પટેલ (કાકા)", "પરિવાર સંયોજક", "પરિવાર", "9824055667", "", "સમગ્ર વાડી વ્યવસ્થા અને સ્વાગત સંભાળશે", "અમદાવાદ")
    ]
    for c_item in contacts:
        c.execute("""
        INSERT INTO contacts (name, role, category, phone, alt_phone, notes, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, c_item)

    # Pre-seeded Shagun (Chandalo)
    shagun = [
        ("રમેશભાઈ ગોવિંદભાઈ પટેલ", "મોટા કાકા", "ગાંધીનગર", 5100, "ચાંદીનો સિક્કો અને ચાંદલો", "2026-10-14", "શુભકામનાઓ"),
        ("હિતેશભાઈ મામા", "મામા", "સુરત", 11000, "કાશીયાત્રાની ચાંદીની લાકડી અને આશીર્વાદ", "2026-10-14", "મામેરું / આશીર્વાદ"),
        ("કલ્પેશભાઈ શાહ", "મિત્ર", "અમદાવાદ", 2100, "શ્રીફળ અને કવર", "2026-10-14", "મિત્ર મંડળ")
    ]
    for s in shagun:
        c.execute("""
        INSERT INTO shagun (name, relation, village, amount, gift_description, date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, s)

    # Pre-seeded Samagri
    samagri_list = [
        ("સુતરની જનોઈ (૩ જોડી)", "Yagnopavita Threads", "3 જોડી", "પૂજા", 1, "શાસ્ત્રીજી"),
        ("દર્ભાસન અને દર્ભ પવિત્રી", "Darbha Grass Mat", "2 નંગ", "પૂજા", 1, "શાસ્ત્રીજી"),
        ("કમંડળ (તાંબા/પિત્તળનું)", "Kamandalu Vessel", "1 નંગ", "વિધિ", 0, "રાજેશભાઈ"),
        ("પલાશનો દંડ (ખાખરાની લાકડી)", "Palasha Stick", "1 નંગ", "વિધિ", 1, "શાસ્ત્રીજી"),
        ("મૃગચર્મનો ટુકડો (અજિન)", "Deer Skin piece (Ajin)", "1 નંગ", "વિધિ", 0, "શાસ્ત્રીજી"),
        ("કાશીયાત્રાની લાકડી અને છત્રી", "Kashi Yatra Stick & Umbrella", "1 સેટ", "પરંપરા", 1, "મામાશ્રી"),
        ("ખડાઉ (લાકડાની પાદુકા / ચાખડી)", "Wooden Sandals (Khadau)", "1 જોડી", "પરંપરા", 1, "મામાશ્રી"),
        ("પીળો રેશમી ખેસ અને કૌપીન (લંગોટ)", "Yellow Silk Shawl & Kaupin", "1 સેટ", "વસ્ત્ર", 1, "ભાવનાબેન"),
        ("પંચગવ્ય અને ગંગાજળ", "Panchagavya & Holy Water", "જરૂર મુજબ", "પૂજા", 0, "રાજેશભાઈ"),
        ("હવન સામગ્રી, તલ, જવ, ઘી, સમિધા", "Havan Samagri & Ghee", "5 કિલો", "પૂજા", 0, "શાસ્ત્રીજી"),
        ("કંકુ, ચોખા, નાડાછડી, સોપારી (૨૧ નંગ)", "Kumkum & Supari", "જરૂર મુજબ", "પૂજા", 1, "ભાવનાબેન"),
        ("તાંબાના કળશ અને શ્રીફળ (૫ નંગ)", "Copper Kalash & Coconut", "5 નંગ", "પૂજા", 1, "દિલીપ કાકા")
    ]
    for sm in samagri_list:
        c.execute("""
        INSERT INTO samagri (item_name, item_name_en, quantity, category, is_arranged, arranged_by)
        VALUES (?, ?, ?, ?, ?, ?)
        """, sm)

    # Initial Activity
    c.execute("""
    INSERT INTO activities (user_name, action_type, description, timestamp)
    VALUES (?, ?, ?, ?)
    """, ("સિસ્ટમ", "પ્રારંભ", "ઉપનયન સંસ્કાર એપ્લિકેશન શુભારંભ થયો", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

    conn.commit()

# WebSocket clients set for real-time live broadcasting
connected_clients: Set[tornado.websocket.WebSocketHandler] = set()

def broadcast_data(event_type: str, payload: dict, sender_socket=None):
    message = json.dumps({"type": event_type, "data": payload, "time": datetime.datetime.now().strftime("%H:%M:%S")})
    for client in list(connected_clients):
        try:
            client.write_message(message)
        except Exception:
            connected_clients.discard(client)

class BaseHandler(tornado.web.RequestHandler):
    def set_default_headers(self):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with, content-type")
        self.set_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
        self.set_header("Content-Type", "application/json; charset=utf-8")

    def options(self, *args, **kwargs):
        self.set_status(204)
        self.finish()

class InfoHandler(BaseHandler):
    def get(self):
        local_ip = get_local_ip()
        self.write({
            "local_ip": local_ip,
            "port": 8000,
            "public_url": PUBLIC_URL,
            "connected_count": len(connected_clients),
            "app_name": "યજ્ઞોપવીત મહોત્સવ - ઉપનયન સંસ્કાર સહાયક"
        })

class AllDataHandler(BaseHandler):
    def get(self):
        conn = get_db()
        c = conn.cursor()
        
        # Settings
        c.execute("SELECT key, value FROM settings")
        settings = {row["key"]: row["value"] for row in c.fetchall()}

        # Programs
        c.execute("SELECT * FROM programs ORDER BY sort_order ASC, date ASC, id ASC")
        programs = [dict(row) for row in c.fetchall()]

        # Tasks
        c.execute("SELECT * FROM tasks ORDER BY is_completed ASC, priority DESC, due_date ASC, id ASC")
        tasks = [dict(row) for row in c.fetchall()]

        # Expenses
        c.execute("SELECT * FROM expenses ORDER BY id DESC")
        expenses = [dict(row) for row in c.fetchall()]

        # Contacts
        c.execute("SELECT * FROM contacts ORDER BY category ASC, id ASC")
        contacts = [dict(row) for row in c.fetchall()]

        # Shagun
        c.execute("SELECT * FROM shagun ORDER BY id DESC")
        shagun = [dict(row) for row in c.fetchall()]

        # Samagri
        c.execute("SELECT * FROM samagri ORDER BY is_arranged ASC, id ASC")
        samagri = [dict(row) for row in c.fetchall()]

        # Activities
        c.execute("SELECT * FROM activities ORDER BY id DESC LIMIT 20")
        activities = [dict(row) for row in c.fetchall()]

        conn.close()

        # Compute summary
        total_spent = sum(e["amount"] for e in expenses if e["payment_status"] in ("ચુકવાઈ ગયું", "ભાગશઃ ચૂકવણી", "Paid"))
        total_estimated = sum(e["estimated_amount"] or e["amount"] for e in expenses)
        total_tasks = len(tasks)
        completed_tasks = sum(1 for t in tasks if t["is_completed"])
        total_shagun = sum(s["amount"] for s in shagun)

        self.write({
            "settings": settings,
            "programs": programs,
            "tasks": tasks,
            "expenses": expenses,
            "contacts": contacts,
            "shagun": shagun,
            "samagri": samagri,
            "activities": activities,
            "summary": {
                "total_spent": total_spent,
                "total_estimated": total_estimated,
                "total_tasks": total_tasks,
                "completed_tasks": completed_tasks,
                "total_shagun": total_shagun,
                "total_contacts": len(contacts)
            }
        })

class ActionHandler(BaseHandler):
    def post(self):
        try:
            req = json.loads(self.request.body.decode('utf-8'))
        except Exception:
            self.set_status(400)
            self.write({"error": "Invalid JSON"})
            return

        action = req.get("action")
        entity = req.get("entity") # task, expense, contact, program, shagun, samagri, settings
        data = req.get("data", {})
        user_name = req.get("user_name", "મિત્ર/પરિવાર")

        conn = get_db()
        c = conn.cursor()
        activity_desc = ""

        try:
            if entity == "task":
                if action == "add":
                    c.execute("""
                    INSERT INTO tasks (title, category, assigned_to, priority, due_date, reminder_time, is_completed)
                    VALUES (?, ?, ?, ?, ?, ?, 0)
                    """, (data.get("title"), data.get("category", "જનરલ"), data.get("assigned_to", ""), data.get("priority", "મધ્યમ"), data.get("due_date", ""), data.get("reminder_time", "")))
                    activity_desc = f"{user_name}એ નવું કાર્ય '{data.get('title')}' ઉમેર્યું."
                elif action == "toggle":
                    task_id = data.get("id")
                    new_val = 1 if data.get("is_completed") else 0
                    completed_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M") if new_val else None
                    completed_by = user_name if new_val else None
                    c.execute("UPDATE tasks SET is_completed = ?, completed_at = ?, completed_by = ? WHERE id = ?", (new_val, completed_at, completed_by, task_id))
                    status_text = "પૂર્ણ કર્યું" if new_val else "અપૂર્ણ કર્યું"
                    c.execute("SELECT title FROM tasks WHERE id = ?", (task_id,))
                    row = c.fetchone()
                    t_name = row["title"] if row else ""
                    activity_desc = f"{user_name}એ કાર્ય '{t_name}' {status_text}."
                elif action == "delete":
                    task_id = data.get("id")
                    c.execute("SELECT title FROM tasks WHERE id = ?", (task_id,))
                    row = c.fetchone()
                    t_name = row["title"] if row else ""
                    c.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
                    activity_desc = f"{user_name}એ કાર્ય '{t_name}' કાઢી નાખ્યું."

            elif entity == "expense":
                if action == "add":
                    c.execute("""
                    INSERT INTO expenses (title, category, amount, estimated_amount, paid_by, payment_status, payment_mode, notes, date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (data.get("title"), data.get("category", "અન્ય"), float(data.get("amount") or 0), float(data.get("estimated_amount") or 0), data.get("paid_by", ""), data.get("payment_status", "ચુકવાઈ ગયું"), data.get("payment_mode", "રોકડ"), data.get("notes", ""), data.get("date", datetime.datetime.now().strftime("%Y-%m-%d"))))
                    activity_desc = f"{user_name}એ ₹{data.get('amount')} નો ખર્ચ '{data.get('title')}' ઉમેર્યો."
                elif action == "delete":
                    c.execute("SELECT title, amount FROM expenses WHERE id = ?", (data.get("id"),))
                    row = c.fetchone()
                    t_name = f"'{row['title']}' (₹{row['amount']})" if row else ""
                    c.execute("DELETE FROM expenses WHERE id = ?", (data.get("id"),))
                    activity_desc = f"{user_name}એ ખર્ચ {t_name} ડિલીટ કર્યો."

            elif entity == "contact":
                if action == "add":
                    c.execute("""
                    INSERT INTO contacts (name, role, category, phone, alt_phone, notes, address)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (data.get("name"), data.get("role"), data.get("category", "સેવા"), data.get("phone", ""), data.get("alt_phone", ""), data.get("notes", ""), data.get("address", "")))
                    activity_desc = f"{user_name}એ સંપર્ક '{data.get('name')}' ({data.get('role')}) ઉમેર્યો."
                elif action == "delete":
                    c.execute("SELECT name FROM contacts WHERE id = ?", (data.get("id"),))
                    row = c.fetchone()
                    c_name = row["name"] if row else ""
                    c.execute("DELETE FROM contacts WHERE id = ?", (data.get("id"),))
                    activity_desc = f"{user_name}એ સંપર્ક '{c_name}' કાઢી નાખ્યો."

            elif entity == "program":
                if action == "add":
                    c.execute("""
                    INSERT INTO programs (title, title_en, date, muhurat_time, venue, priest_incharge, notes, status, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (data.get("title"), data.get("title_en", ""), data.get("date", ""), data.get("muhurat_time", ""), data.get("venue", ""), data.get("priest_incharge", ""), data.get("notes", ""), data.get("status", "upcoming"), int(data.get("sort_order") or 0)))
                    activity_desc = f"{user_name}એ કાર્યક્રમ '{data.get('title')}' ઉમેર્યો."
                elif action == "update_status":
                    c.execute("UPDATE programs SET status = ? WHERE id = ?", (data.get("status"), data.get("id")))
                    activity_desc = f"{user_name}એ કાર્યક્રમ સ્ટેટસ અપડેટ કર્યું."
                elif action == "delete":
                    c.execute("DELETE FROM programs WHERE id = ?", (data.get("id"),))
                    activity_desc = f"{user_name}એ કાર્યક્રમ ડિલીટ કર્યો."

            elif entity == "shagun":
                if action == "add":
                    c.execute("""
                    INSERT INTO shagun (name, relation, village, amount, gift_description, date, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (data.get("name"), data.get("relation", ""), data.get("village", ""), float(data.get("amount") or 0), data.get("gift_description", ""), data.get("date", datetime.datetime.now().strftime("%Y-%m-%d")), data.get("notes", "")))
                    activity_desc = f"{user_name}એ ચાંદલો/ભેટ નોંધણી ઉમેરી: '{data.get('name')}' (₹{data.get('amount')})."
                elif action == "delete":
                    c.execute("DELETE FROM shagun WHERE id = ?", (data.get("id"),))
                    activity_desc = f"{user_name}એ ચાંદલાની નોંધ ડિલીટ કરી."

            elif entity == "samagri":
                if action == "add":
                    c.execute("""
                    INSERT INTO samagri (item_name, item_name_en, quantity, category, is_arranged, arranged_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, (data.get("item_name"), data.get("item_name_en", ""), data.get("quantity", ""), data.get("category", "પૂજા"), 0, data.get("arranged_by", "")))
                    activity_desc = f"{user_name}એ સામગ્રી '{data.get('item_name')}' ઉમેરી."
                elif action == "toggle":
                    sm_id = data.get("id")
                    new_val = 1 if data.get("is_arranged") else 0
                    arr_by = user_name if new_val else ""
                    c.execute("UPDATE samagri SET is_arranged = ?, arranged_by = ? WHERE id = ?", (new_val, arr_by, sm_id))
                    activity_desc = f"{user_name}એ સામગ્રી વ્યવસ્થા અપડેટ કરી."
                elif action == "delete":
                    c.execute("DELETE FROM samagri WHERE id = ?", (data.get("id"),))
                    activity_desc = f"{user_name}એ સામગ્રી કાઢી નાખી."

            elif entity == "settings":
                for k, v in data.items():
                    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
                activity_desc = f"{user_name}એ પ્રસંગ સેટિંગ્સ અપડેટ કર્યા."

            if activity_desc:
                c.execute("""
                INSERT INTO activities (user_name, action_type, description, timestamp)
                VALUES (?, ?, ?, ?)
                """, (user_name, action, activity_desc, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

            conn.commit()
            conn.close()

            # Broadcast update to all connected WebSockets
            broadcast_data("sync_needed", {
                "activity": activity_desc,
                "user": user_name,
                "entity": entity,
                "action": action
            })

            self.write({"success": True, "message": activity_desc})

        except Exception as e:
            conn.rollback()
            conn.close()
            self.set_status(500)
            self.write({"error": str(e)})

class RealTimeWebSocket(tornado.websocket.WebSocketHandler):
    def check_origin(self, origin):
        return True

    def open(self):
        connected_clients.add(self)
        self.user_name = "અજ્ઞાત"
        # Notify all of new peer count
        broadcast_data("peer_count", {"count": len(connected_clients)})

    def on_message(self, message):
        try:
            msg = json.loads(message)
            if msg.get("type") == "join":
                self.user_name = msg.get("user_name", "મિત્ર")
                broadcast_data("user_joined", {"user_name": self.user_name, "count": len(connected_clients)})
            elif msg.get("type") == "ping":
                self.write_message(json.dumps({"type": "pong"}))
        except Exception:
            pass

    def on_close(self):
        connected_clients.discard(self)
        broadcast_data("peer_count", {"count": len(connected_clients)})

def make_app():
    return tornado.web.Application([
        (r"/", tornado.web.RedirectHandler, {"url": "/static/index.html"}),
        (r"/api/info", InfoHandler),
        (r"/api/all", AllDataHandler),
        (r"/api/action", ActionHandler),
        (r"/ws", RealTimeWebSocket),
        (r"/static/(.*)", tornado.web.StaticFileHandler, {"path": STATIC_PATH, "default_filename": "index.html"}),
    ], debug=False)

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 8000))
    app = make_app()
    app.listen(port, address="0.0.0.0")
    local_ip = get_local_ip()

    # Launch Cloudflare tunnel for local development if cloudflared exists and not on cloud
    if os.path.exists(CLOUDFLARED_EXE) and not os.environ.get("RENDER"):
        t = threading.Thread(target=start_cloudflared, args=(port,), daemon=True)
        t.start()

    print("="*65)
    print(" 🕉️ યજ્ઞોપવીત મહોત્સવ - ઉપનયન સંસ્કાર એપ્લિકેશન લાઈવ છે!")
    print("="*65)
    print(f"👉 પોર્ટ (Port): {port}")
    print(f"👉 લોકલ કમ્પ્યુટર પર: http://localhost:{port}")
    print(f"👉 ઘરના Wi-Fi પર: http://{local_ip}:{port}")
    print("="*65)
    tornado.ioloop.IOLoop.current().start()
