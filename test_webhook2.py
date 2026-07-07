import json
from utils.supabase_client import supabase
res = supabase.table("webhook_events").select("event_type, payload, received_at").in_("event_type", ["callinitiated", "call.initiated", "unknown_event", "hangup"]).order("received_at", desc=True).limit(5).execute()
for r in res.data:
    print(r['received_at'], r['event_type'])
    print(json.dumps(r['payload'], indent=2))
    print("---")
