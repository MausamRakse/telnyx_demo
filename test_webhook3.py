import json
from utils.supabase_client import supabase
res = supabase.table("webhook_events").select("event_type, payload, received_at").order("received_at", desc=True).limit(20).execute()
for r in res.data:
    if r['received_at'].startswith("2026-07-07T09:57"):
        print(r['received_at'], r['event_type'])
