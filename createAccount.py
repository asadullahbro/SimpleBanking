import customtkinter as ctk
import json

def open_create_account():
    try:
        with open("accounts.json", "r") as f:
            accounts = json.load(f)
    except FileNotFoundError:
        accounts = {}
    window = ctk.CTkToplevel()
    window.geometry("400x300")
    window.title("Create Account")

    name_entry = ctk.CTkEntry(window, placeholder_text="Enter your name")
    name_entry.pack(pady=10)

    balance_entry = ctk.CTkEntry(window, placeholder_text="Enter initial balance")
    balance_entry.pack(pady=10)

    feedback_label = ctk.CTkLabel(window, text="")
    feedback_label.pack(pady=10)

    def create_account_logic():
        name = name_entry.get()
        balance = balance_entry.get()

        try:
            balance = float(balance)
        except ValueError:
            feedback_label.configure(text="Balance must be a number")
            return

        if name in accounts:
            feedback_label.configure(text="Account already exists", text_color="red")
        else:
            accounts[name] = balance
            with open("accounts.json", "w") as f:
                json.dump(accounts, f)
            feedback_label.configure(text=f"Successfully created account: {name}", text_color="green")

        name_entry.delete(0, "end")
        balance_entry.delete(0, "end")

    create_btn = ctk.CTkButton(window, text="Create Account", command=create_account_logic)
    create_btn.pack(pady=10)


