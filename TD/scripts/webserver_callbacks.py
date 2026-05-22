import json
import os

# Module-level session state (lives as long as the .toe is open)
current_session_path = ""
attempt_count = 0
active_module = ""


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

def _processing_module():
    return _root().op('video_pipeline/processing_module')

def _final_output():
    return _root().op('video_pipeline/out_module/final_output')

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
            'module':      active_module,
        })
        return response

    routes = {
        '/start_recording':        _handle_start_recording,
        '/capture_snapshot':       _handle_capture_snapshot,
        '/stop_and_save':          _handle_stop_and_save,
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

def _handle_ready_for_next_attempt(body):
    _set_state(2)   # IDLE

def _handle_reset(body):
    global current_session_path, attempt_count
    module_name = body.get('module', '')
    if module_name and module_name != active_module:
        try:
            _handle_set_module({'module': module_name})
        except Exception as e:
            print(f'[comm_server] module switch failed during reset, continuing: {e}')
    session_id = body.get('sessionID', 'default')
    current_session_path = os.path.join(_sessions_root(), session_id)
    os.makedirs(current_session_path, exist_ok=True)
    attempt_count = 0
    _chop().par.value1 = 0   # session_id channel 重置為 0（字串路徑由模組變數管理）
    _set_photo_index(0)
    _set_state(2)   # IDLE
    print(f'[comm_server] reset => session: {session_id}')

def _handle_set_module(body):
    global active_module
    module_name = body.get('module', '')
    if not module_name:
        raise ValueError('missing module name')

    tox_path = os.path.normpath(
        os.path.join(project.folder, '..', 'modules', module_name, 'effect.tox')
    )
    if not os.path.exists(tox_path):
        raise FileNotFoundError(f'effect.tox not found for module: {module_name}')

    proc = _processing_module()

    # Save current tox before switching (protects in-progress edits in dev)
    current_tox = proc.par.externaltox.val
    if current_tox and os.path.exists(current_tox):
        proc.save(current_tox)
        print(f'[comm_server] saved current tox => {current_tox}')

    proc.par.externaltox = tox_path
    proc.par.reinitnet.pulse()
    active_module = module_name
    print(f'[comm_server] module switched => {module_name}')


# ── Save scheduling ────────────────────────────────────────────────────────────

def _schedule_save():
    global attempt_count
    attempt_count += 1
    photo_index = attempt_count
    filename    = f'raw_{photo_index}.png'
    filepath    = os.path.join(current_session_path, filename)
    _set_photo_index(photo_index)

    # 延遲 2 幀：確保 processing_module 最後一幀已 cook 完畢
    run("me.module.do_delayed_save(args[0], args[1], args[2])",
        filepath, filename, photo_index,
        delayFrames=2)
    print(f'[comm_server] save scheduled => {filename}')


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
