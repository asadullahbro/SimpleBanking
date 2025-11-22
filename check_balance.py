from tkinter.font import names
import customtkinter as ctk
import json
def check_balance():
    window = ctk.CTkToplevel()
    window.geometry("400x300")
    window.title("Check Balance")

    name_entry = ctk.CTkEntry(window, placeholder_text="Account Name")
    name_entry.pack(pady=10)

    feedback_label = ctk.CTkLabel(window, text="")
    feedback_label.pack(pady=10)
    def logic_check_balance():
        try:
            with open("accounts.json", "r") as f:
                accounts = json.load(f)
        except FileNotFoundError:
            accounts = {}
        name = name_entry.get()
        if name in accounts:
            balance = accounts[name]
            feedback_label.configure(text=f"Balance: {balance}")
            name_entry.delete(0, "end")
        else:
            feedback_label.configure(text=f"Account {name} does not exist")
            name_entry.delete(0, "end")
    check_balance_btn = ctk.CTkButton(window, text="Check Balance", command=logic_check_balance)
    check_balance_btn.pack(pady=10)

