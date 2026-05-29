import json
import os

print("no no no no")

# ── Path helpers ───────────────────────────────────────────────────────────────
# This script lives inside comm_server Base COMP.
# me.parent()         = comm_server
# me.parent().parent() = project1 root (where state_holder and video_pipeline live)

def _root():
    return me.parent().parent()

def _chop():
    return _root().op('state_holder/states')

def _set_state(val):
    _chop().par.value0 = val

def _get_photo_index():
    return int(_chop()['photo_index'].eval())

def _set_photo_index(val):
    _chop().par.value2 = val  # value0=state, value1=session_id, value2=photo_index

# New persistence helpers for current_session_path, attempt_count, active_module
def _get_session_path():
    """Retrieves the current session path from the CHOP parameter."""
    # Now reads from the 'session_path' Text DAT
    session_path_dat = _root().op('state_holder/session_path')
    print(session_path_dat)
    if session_path_dat:
        return session_path_dat.text.strip()
    else:
        print(f"[comm_server] Error: 'state_holder/session_path' Text DAT not found. Returning empty path.")
        return "" # Return empty string as a safe fallback

def _set_session_path(path):
    """Stores the current session path into the CHOP parameter."""
    # Now writes to the 'session_path' Text DAT
    print("!",path)
    session_path_dat = _root().op('state_holder/session_path')
    if session_path_dat:
        session_path_dat.text = path

def _get_attempt_count():
    """Retrieves the current attempt count from the CHOP parameter, ensuring it's an integer."""
    try:
        # CHOP parameters store values as strings; convert to float first for robustness
        return int(_chop()['attempt_count'].eval())
    except ValueError:
        return 0

def _set_attempt_count(count):
    """Stores the current attempt count into the CHOP parameter."""
    _chop().par.value4 = count

def _get_active_module():
    return _chop()['active_module'].eval()

def _set_active_module(module_name):
    _chop().par.value5 = module_name

def _processing_module():
    return _root().op('video_pipeline/processing_module')

def _final_output():
    return _root().op('video_pipeline/out_module/final_output')

def _movie_out():
    return _root().op('video_pipeline/out_module/final_movie_output')

def _sessions_root():
    # project.folder = .../spark/TD/  →  sessions/ 在一層上
    return os.path.normpath(os.path.join(project.folder, '..', 'sessions'))


# ── Web Server DAT callback ────────────────────────────────────────────────────

def onHTTPRequest(webServerDAT, request, response):
    method = request['method']
    uri    = request['uri']
    body   = {}

    if request.get('data'):
        try:
            body = json.loads(request['data'])
        except Exception:
            pass

    print(method, uri)

    if method == 'GET' and uri == '/':
        response['statusCode'] = 200
        response['data'] = json.dumps({
            'state':       int(_chop()['state'].eval()),
            'photo_index': _get_photo_index(),
            'fps':         round(project.cookRate, 2),
            'module':      _get_active_module(),
        })
        return response

    routes = {
        '/start_recording':        _handle_start_recording,
        '/capture_snapshot':       _handle_capture_snapshot,
        '/stop_and_save':          _handle_stop_and_save,
        '/start_video_record':     _handle_start_video_record,
        '/stop_video_record':      _handle_stop_video_record,
        '/ready_for_next_attempt': _handle_ready_for_next_attempt,
        '/reset':                  _handle_reset,
        '/set_module':             _handle_set_module,
    }

    handler = routes.get(uri) if method == 'POST' else None
    if handler:
        try:
            handler(body)
            response['statusCode'] = 200
            response['data'] = json.dumps({'status': 'ok'})
        except Exception as e:
            response['statusCode'] = 500
            response['data'] = json.dumps({'error': str(e)})
            print(f'[comm_server] error on {uri}: {e}')
    else:
        response['statusCode'] = 404
        response['data'] = json.dumps({'error': 'not found'})

    response.setdefault('headers', {})['Content-Type'] = 'application/json'
    return response


# ── Route handlers ─────────────────────────────────────────────────────────────

def _handle_start_recording(body):
    _set_state(0)   # RECORDING — processing_module 自己透過 CHOP Execute 切換 switch

def _handle_capture_snapshot(body):
    _set_state(1)   # FINISHED (存檔中)
    _schedule_save()

def _handle_stop_and_save(body):
    _set_state(1)   # FINISHED (存檔中) — processing_module 自己凍結輸出
    _schedule_save()

def _handle_start_video_record(body):
    current_count = _get_attempt_count()
    new_count = current_count + 1
    _set_attempt_count(new_count)
    filename = f'raw_{new_count}.mov'
    filepath = os.path.join(_get_session_path(), filename)

    mo = _movie_out() # Using _movie_out() directly is fine
    mo.par.record = 0 # 【新增】安全機制：確保先關閉舊的
    
    mo.par.file = filepath.replace('\\', '/') 
    
    mo.par.record = 1
    _set_photo_index(new_count) # 修正：應使用 new_count
    _set_state(0)  # RECORDING
    print(f'[comm_server] video record started => {filepath}')

def _handle_stop_video_record(body):
    _movie_out().par.record = 0
    _set_state(1)  # PROCESSING

    current_count = _get_attempt_count()
    filename = f'raw_{current_count}.mov'
    run("me.module.notify_node(args[0], args[1])",
        current_count, filename,
        delayFrames=30)
    print(f'[comm_server] video record stopped => {filename}')

def _handle_ready_for_next_attempt(body):
    _set_state(2)   # IDLE

def _handle_reset(body):
    session_id = body.get('sessionID', 'default')
    new_session_path = os.path.join(_sessions_root(), session_id)
    os.makedirs(new_session_path, exist_ok=True)
    _set_session_path(new_session_path)
    _set_attempt_count(0)
    _chop().par.value1 = 0   # session_id channel 重置為 0（字串路徑由模組變數管理）
    _set_photo_index(0)
    _set_state(2)   # IDLE
    print(f'[comm_server] reset => session: {session_id}')

def _handle_set_module(body):
    module_name = body.get('module', '')
    if not module_name:
        raise ValueError('missing module name')

    tox_path = os.path.normpath(
        os.path.join(project.folder, '..', 'modules', module_name, 'effect.tox')
    )
    if not os.path.exists(tox_path):
        raise FileNotFoundError(f'effect.tox not found for module: {module_name}')

    proc = _processing_module()
    # 如果當前模組已經是目標模組，則不執行任何操作，避免不必要的重新載入
    if os.path.normpath(proc.par.externaltox.val) == tox_path:
        print(f'[comm_server] module already active: {module_name}, skipping reload.')
        return

    proc = _processing_module()
    # Save current tox before switching (protects in-progress edits in dev)
    current_tox = proc.par.externaltox.val
    if current_tox and os.path.exists(current_tox):
        proc.save(current_tox)
        print(f'[comm_server] saved current tox => {current_tox}')

    proc.par.externaltox = tox_path
    proc.par.reinitnet.pulse()
    _set_active_module(module_name)
    print(f'[comm_server] module switched => {module_name}')


# ── Save scheduling ────────────────────────────────────────────────────────────

def _schedule_save():
    current_count = _get_attempt_count()
    new_count = current_count + 1
    _set_attempt_count(new_count)
    photo_index = new_count
    filename    = f'raw_{photo_index}.png'
    filepath    = os.path.join(_get_session_path(), filename) # 修正：補齊 filepath 賦值
    _set_photo_index(photo_index)

    # 延遲 2 幀：確保 processing_module 最後一幀已 cook 完畢
    run("me.module.do_delayed_save(args[0], args[1], args[2])",
        filepath, filename, photo_index,
        delayFrames=2)
    print(f'[comm_server] save scheduled => {filepath}')


def do_delayed_save(filepath, filename, photo_index):
    _final_output().save(filepath)
    print(f'[comm_server] saved => {filepath}')
    notify_node(photo_index, filename)


# ── Outgoing HTTP to Node.js ───────────────────────────────────────────────────

def notify_node(index, filename):
    import requests
    payload = {
        'state':       4,
        'message':     'reviewing',
        'currentFile': filename,
    }
    try:
        requests.post('http://127.0.0.1:5000/td_state_update',
                      json=payload, timeout=3)
    except Exception as e:
        print(f'[comm_server] notify_node failed: {e}')
