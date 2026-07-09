import asyncio
from utils.supabase_client import supabase

def fix_statuses():
    print("Fetching calls with status='failed'...")
    res = supabase.table("calls").select("id, call_session_id, status").eq("status", "failed").execute()
    calls = res.data or []
    
    fixed = 0
    for c in calls:
        call_id = c["id"]
        session_id = c.get("call_session_id")
        
        has_rec = False
        has_trans = False
        
        # check recording
        rec_res = supabase.table("recordings").select("id").eq("call_id", call_id).limit(1).execute()
        if rec_res.data:
            has_rec = True
            
        # check transcript
        tr_res = supabase.table("transcript_messages").select("id").eq("call_id", call_id).limit(1).execute()
        if tr_res.data:
            has_trans = True
            
        if has_rec or has_trans:
            print(f"Fixing call {call_id} (session: {session_id})...")
            supabase.table("calls").update({"status": "completed"}).eq("id", call_id).execute()
            fixed += 1

    print(f"Fixed {fixed} calls.")

if __name__ == "__main__":
    fix_statuses()
