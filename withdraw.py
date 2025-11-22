import customtkinter as ctk
import json



def withdraw_gui():
    try:
        with open("accounts.json", "r") as file:
            accounts = json.load(file)
    except FileNotFoundError:
        accounts = {}
    window = ctk.CTkToplevel()
    window.geometry("400x300")
    window.title("Withdraw money")
    feedback_label = ctk.CTkLabel(window, text="")
    feedback_label.pack(pady=10)
    name_entry = ctk.CTkEntry(window, placeholder_text="Enter Name")
    name_entry.pack(pady=10)
    balance_entry = ctk.CTkEntry(window, placeholder_text="Enter Amount")
    balance_entry.pack(pady=10)

    def withdraw_money():
        name = name_entry.get()
        withdraw_amount = balance_entry.get()
        try:
            withdraw_amount = float(withdraw_amount)
        except ValueError:
            feedback_label.configure(text="Please enter a numeric value")
            return
        if withdraw_amount <= 0:
            feedback_label.configure(text="Withdrawal must be positive!")
            return
        if name not in accounts:
            feedback_label.configure(text="Account does not exist!")
            return
        if withdraw_amount > accounts[name]:
            feedback_label.configure(text=f"Insufficient balance! Current: {accounts[name]}")
            return
        accounts[name] -= withdraw_amount
        feedback_label.configure(text=f"Withdrawn {withdraw_amount}! Current balance: {accounts[name]}")
        with open("accounts.json", "w") as file:
            json.dump(accounts, file, indent=4)
        balance_entry.delete(0, "end")
    withdraw_money_btn = ctk.CTkButton(window, text="Withdraw", command=withdraw_money)
    withdraw_money_btn.pack(pady=10)
