import os
import hashlib
import shutil
import secrets
import string
import json
from datetime import datetime
from cryptography.fernet import Fernet
from flask import Flask, render_template, request, jsonify, send_file, flash, redirect, url_for
import io
import math
import time

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

class CyberShieldWeb:
    def __init__(self):
        self.key = None
        self.cipher_suite = None
        self.hash_file = "file_hashes.json"
        self.backup_dir = "backups"
        self.key_file = "encryption.key"
        
        # Create necessary directories first
        self.setup_directories()
        self.load_or_create_key()
        self.hashes = self.load_hashes()
    
    def setup_directories(self):
        """Create necessary directories with proper permissions"""
        try:
            os.makedirs(self.backup_dir, exist_ok=True)
            # Set directory permissions (read, write, execute for owner)
            os.chmod(self.backup_dir, 0o755)
        except Exception as e:
            print(f"Warning: Could not create backup directory: {e}")
    
    def load_or_create_key(self):
        """Load existing key or create a new one with proper file handling"""
        try:
            if os.path.exists(self.key_file):
                # Try to read existing key
                with open(self.key_file, "rb") as f:
                    self.key = f.read()
                print("✅ Encryption key loaded successfully")
            else:
                # Create new key
                self.key = Fernet.generate_key()
                with open(self.key_file, "wb") as f:
                    f.write(self.key)
                # Set file permissions (read/write for owner only)
                os.chmod(self.key_file, 0o600)
                print("✅ New encryption key created and saved")
            
            self.cipher_suite = Fernet(self.key)
            
        except PermissionError:
            print("❌ Permission denied for key file. Using in-memory key only.")
            # Fallback: use in-memory key (will be lost on restart)
            self.key = Fernet.generate_key()
            self.cipher_suite = Fernet(self.key)
            
        except Exception as e:
            print(f"❌ Error handling encryption key: {e}")
            # Final fallback
            self.key = Fernet.generate_key()
            self.cipher_suite = Fernet(self.key)
    
    def load_hashes(self):
        """Load existing hashes or return empty dict"""
        try:
            if os.path.exists(self.hash_file):
                with open(self.hash_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"Warning: Could not load hashes: {e}")
        return {}
    
    def save_hashes(self):
        """Save hashes to file with error handling"""
        try:
            with open(self.hash_file, 'w') as f:
                json.dump(self.hashes, f, indent=4)
        except Exception as e:
            print(f"Warning: Could not save hashes: {e}")

# Initialize the cyber shield
try:
    cyber_shield = CyberShieldWeb()
    print("🚀 CyberShield Web initialized successfully!")
except Exception as e:
    print(f"❌ Failed to initialize CyberShield: {e}")
    exit(1)

# ... [rest of your routes remain the same] ...

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/encrypt', methods=['POST'])
def encrypt_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file selected'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        # Read file data
        file_data = file.read()
        original_filename = file.filename
        
        # Encrypt the file
        encrypted_data = cyber_shield.cipher_suite.encrypt(file_data)
        
        # Create response with encrypted file
        output = io.BytesIO()
        output.write(encrypted_data)
        output.seek(0)
        
        return send_file(
            output,
            as_attachment=True,
            download_name=f"{original_filename}.encrypted",
            mimetype='application/octet-stream'
        )
        
    except Exception as e:
        return jsonify({'error': f'Encryption failed: {str(e)}'}), 500

@app.route('/decrypt', methods=['POST'])
def decrypt_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file selected'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        # Read encrypted file
        encrypted_data = file.read()
        
        # Decrypt the file
        decrypted_data = cyber_shield.cipher_suite.decrypt(encrypted_data)
        
        # Determine original filename
        if file.filename.endswith('.encrypted'):
            original_name = file.filename.replace('.encrypted', '')
        else:
            original_name = file.filename + ".decrypted"
        
        # Create response with decrypted file
        output = io.BytesIO()
        output.write(decrypted_data)
        output.seek(0)
        
        return send_file(
            output,
            as_attachment=True,
            download_name=original_name,
            mimetype='application/octet-stream'
        )
        
    except Exception as e:
        return jsonify({'error': f'Decryption failed: {str(e)}'}), 500

@app.route('/compute_hash', methods=['POST'])
def compute_hash():
    if 'file' not in request.files:
        return jsonify({'error': 'No file selected'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        # Compute SHA-256 hash
        sha256_hash = hashlib.sha256()
        file_data = file.read()
        sha256_hash.update(file_data)
        file_hash = sha256_hash.hexdigest()
        
        # Store hash information
        timestamp = datetime.now().isoformat()
        cyber_shield.hashes[file.filename] = {
            'hash': file_hash,
            'timestamp': timestamp,
            'size': len(file_data)
        }
        cyber_shield.save_hashes()
        
        return jsonify({
            'success': True,
            'hash': file_hash,
            'filename': file.filename,
            'timestamp': timestamp
        })
        
    except Exception as e:
        return jsonify({'error': f'Hash computation failed: {str(e)}'}), 500

@app.route('/verify_integrity', methods=['POST'])
def verify_integrity():
    if 'file' not in request.files:
        return jsonify({'error': 'No file selected'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        filename = file.filename
        
        if filename not in cyber_shield.hashes:
            return jsonify({'error': 'No stored hash found for this file'}), 400
        
        # Compute current hash
        sha256_hash = hashlib.sha256()
        file_data = file.read()
        sha256_hash.update(file_data)
        current_hash = sha256_hash.hexdigest()
        
        # Get stored hash
        stored_hash = cyber_shield.hashes[filename]['hash']
        stored_time = cyber_shield.hashes[filename]['timestamp']
        
        # Compare hashes
        integrity_verified = current_hash == stored_hash
        
        return jsonify({
            'success': True,
            'integrity_verified': integrity_verified,
            'current_hash': current_hash,
            'stored_hash': stored_hash,
            'stored_time': stored_time,
            'filename': filename
        })
        
    except Exception as e:
        return jsonify({'error': f'Integrity verification failed: {str(e)}'}), 500

@app.route('/backup', methods=['POST'])
def backup_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file selected'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        filename = file.filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(cyber_shield.backup_dir, f"{filename}.backup_{timestamp}")
        
        # Save the file
        file.save(backup_path)
        
        return jsonify({
            'success': True,
            'message': f'Backup created: {backup_path}',
            'backup_path': backup_path
        })
        
    except Exception as e:
        return jsonify({'error': f'Backup failed: {str(e)}'}), 500

@app.route('/generate_password', methods=['POST'])
def generate_password():
    try:
        data = request.get_json()
        length = data.get('length', 16)
        include_uppercase = data.get('uppercase', True)
        include_lowercase = data.get('lowercase', True)
        include_digits = data.get('digits', True)
        include_symbols = data.get('symbols', True)
        
        # Validate length
        if not 12 <= length <= 32:
            return jsonify({'error': 'Password length must be between 12 and 32'}), 400
        
        # Build character set
        characters = ""
        if include_uppercase:
            characters += string.ascii_uppercase
        if include_lowercase:
            characters += string.ascii_lowercase
        if include_digits:
            characters += string.digits
        if include_symbols:
            characters += string.punctuation
        
        if not characters:
            return jsonify({'error': 'Select at least one character type'}), 400
        
        # Generate password ensuring at least one of each selected type
        password = []
        if include_uppercase:
            password.append(secrets.choice(string.ascii_uppercase))
        if include_lowercase:
            password.append(secrets.choice(string.ascii_lowercase))
        if include_digits:
            password.append(secrets.choice(string.digits))
        if include_symbols:
            password.append(secrets.choice(string.punctuation))
        
        # Fill remaining length
        while len(password) < length:
            password.append(secrets.choice(characters))
        
        # Shuffle and create final password
        secrets.SystemRandom().shuffle(password)
        final_password = ''.join(password)
        
        # Analyze password strength
        strength = analyze_password_strength(final_password)
        
        return jsonify({
            'success': True,
            'password': final_password,
            'strength': strength
        })
        
    except Exception as e:
        return jsonify({'error': f'Password generation failed: {str(e)}'}), 500

@app.route('/view_hashes')
def view_hashes():
    return jsonify({
        'success': True,
        'hashes': cyber_shield.hashes,
        'count': len(cyber_shield.hashes)
    })

@app.route('/system_info')
def system_info():
    try:
        backup_files = [f for f in os.listdir(cyber_shield.backup_dir) if f.endswith('.backup')]
        backup_count = len(backup_files)
    except:
        backup_count = 0
    
    return jsonify({
        'success': True,
        'stored_hashes': len(cyber_shield.hashes),
        'backup_files': backup_count,
        'encryption_key': 'Loaded' if cyber_shield.key else 'Missing',
        'cipher_suite': 'Active' if cyber_shield.cipher_suite else 'Inactive'
    })

def analyze_password_strength(password):
    score = 0
    length = len(password)
    
    # Length score
    if length >= 12:
        score += 2
    if length >= 16:
        score += 2
    if length >= 20:
        score += 1
    
    # Character variety
    if any(c.islower() for c in password):
        score += 1
    if any(c.isupper() for c in password):
        score += 1
    if any(c.isdigit() for c in password):
        score += 1
    if any(c in string.punctuation for c in password):
        score += 1
    
    if score >= 8:
        return "🔒 VERY STRONG"
    elif score >= 6:
        return "🛡️ STRONG"
    elif score >= 4:
        return "⚠️ MODERATE"
    else:
        return "🚨 WEAK"

if __name__ == '__main__':
    print("🌐 Starting CyberShield Web Application...")
    print("📁 Application Directory:", os.getcwd())
    print("🔑 Key File:", cyber_shield.key_file)
    print("💾 Backup Directory:", cyber_shield.backup_dir)
    print("🔍 Hash File:", cyber_shield.hash_file)
    
    app.run(debug=True, host='0.0.0.0', port=5000)