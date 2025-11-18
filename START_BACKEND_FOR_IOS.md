# 🚀 Start Backend for iOS Testing

## ⚡ Quick Start Script

I created a simple startup script for you!

### **Run This Command:**

```bash
cd /Users/aungmaw/rial/backend
./start-for-ios.sh
```

**This:**
- Kills any existing node processes
- Starts backend on 0.0.0.0:3000 (accessible from simulator)
- Disables database (no PostgreSQL needed)
- Logs to /tmp/backend-ios.log

**Keep this terminal open while testing!**

---

## ✅ **Then Test in Xcode:**

```
1. Backend running (terminal above)
2. In Xcode: ⌘⇧K (Clean)
3. ⌘R (Build and Run)
4. Take photo
5. Certify
6. Should work! ✅
```

---

## 📊 **Check Logs:**

```bash
# Watch backend logs in real-time
tail -f /tmp/backend-ios.log

# Check if backend is responding
curl http://127.0.0.1:3000/health
```

---

**START THE BACKEND WITH THE SCRIPT AND TEST!** 🚀

