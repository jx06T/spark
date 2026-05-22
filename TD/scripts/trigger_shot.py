import requests

# 讓 TD 主動觸發拍攝（手勢、感應器等）
# 用法：在 TD 的任意 Execute DAT 或按鈕呼叫 op('trigger_shot').run()
# Node.js 收到後若 state=2 會執行 runCountdown()

try:
    requests.post('http://127.0.0.1:5000/td_trigger_shot',
                  json={}, timeout=3)
    print('[comm_server] trigger_shot sent')
except Exception as e:
    print(f'[comm_server] trigger_shot failed: {e}')
