# SmartPark – Real-Time Parking Management System

## Overview

SmartPark is a full-stack parking management system designed to simulate the operations of a modern multi-floor parking facility. The application automates vehicle entry, parking slot allocation, dynamic pricing, billing, revenue tracking, and operational monitoring in real time.

The system was built to explore real-world business logic implementation, including peak-hour pricing, GST-compliant invoicing, occupancy management, and analytics-driven administration.

---

## System Architecture

### Frontend Layer

* Vanilla JavaScript
* Tailwind CSS
* Chart.js

Responsible for:

* Interactive user interface
* Real-time parking occupancy visualization
* Revenue analytics dashboard
* Vehicle search and management
* Receipt generation and printing

### Backend Layer

* Node.js
* Express.js

Responsible for:

* API development
* Parking allocation algorithms
* Billing calculations
* Dynamic pricing engine
* Overstay monitoring
* Business rule enforcement

### Database Layer

* SQLite

Stores:

* Vehicle records
* Parking transactions
* Floor occupancy data
* Revenue history
* Activity logs
* Pricing configurations

---

## Architecture Flow

Vehicle Entry
↓
Vehicle Validation
↓
Smart Spot Allocation Engine
↓
Floor Assignment (3 Floors)
↓
Occupancy Database Update
↓
Real-Time Capacity Map Refresh
↓
Vehicle Exit Request
↓
Dynamic Billing Engine
↓
GST Calculation (18%)
↓
Receipt Generation
↓
Revenue Dashboard Update

---

## Core Modules

### 1. Parking Allocation Engine

The allocation engine automatically assigns the nearest available parking slot based on vehicle type and floor availability.

Supported vehicle categories:

* Bike
* Car
* Truck
* Bus

Features:

* Real-time availability tracking
* Multi-floor allocation
* Automatic capacity updates
* Instant occupancy synchronization

---

### 2. Dynamic Pricing Engine

SmartPark implements time-sensitive pricing to maximize parking revenue.

Peak Hours:

* 8:00 AM – 10:00 AM
* 5:00 PM – 8:00 PM

The billing engine evaluates every parking hour individually rather than applying a single rate to the entire stay.

Example:

8:30 AM – 11:30 AM

Hour 1 → Peak Rate

Hour 2 → Peak Rate

Hour 3 → Off-Peak Rate

This produces highly accurate billing similar to commercial parking systems.

---

### 3. Billing & GST Module

When a vehicle exits:

* Parking duration is calculated
* Hour-by-hour charges are generated
* Peak and off-peak rates are applied
* 18% GST is calculated automatically
* Final invoice is generated

Generated receipts include:

* Vehicle details
* Entry & exit timestamps
* Hourly charge breakdown
* GST amount
* Total payable amount

---

### 4. Real-Time Monitoring System

Administrators can monitor:

* Floor occupancy
* Available parking spots
* Vehicle movement
* Current capacity utilization

The parking map updates instantly whenever vehicles enter or leave the facility.

---

### 5. Revenue Analytics Dashboard

The analytics dashboard provides operational insights including:

* Daily revenue trends
* 7-day revenue visualization
* Vehicle-type distribution
* Occupancy statistics
* Historical transaction tracking

Charts are generated using Chart.js for real-time reporting.

---

### 6. Overstay Detection System

The system continuously scans active parking sessions.

Vehicles parked for more than 10 hours are automatically flagged and displayed in the alert panel for administrative action.

---

### 7. Search & Export Module

Additional management features include:

* Plate number search
* Recent activity logs
* Transaction history
* CSV report export
* Operational auditing support

---

## Database Design

### Vehicles Table

Stores vehicle information:

* Vehicle Number
* Vehicle Type
* Entry Time
* Assigned Floor
* Assigned Slot

### Transactions Table

Stores billing information:

* Transaction ID
* Parking Duration
* Charge Breakdown
* GST
* Final Amount

### Revenue Table

Stores:

* Daily revenue
* Vehicle category revenue
* Historical analytics

---

## Key Technical Highlights

* Full-stack architecture using Node.js, Express, and SQLite
* Real-time occupancy tracking
* Dynamic peak-hour pricing engine
* GST-compliant invoice generation
* Multi-floor parking management
* Revenue analytics dashboard
* Overstay monitoring system
* CSV data export functionality
* Fully responsive administrative interface

---

## Tech Stack

Frontend:

* HTML5
* Tailwind CSS
* Vanilla JavaScript
* Chart.js

Backend:

* Node.js
* Express.js

Database:

* SQLite

Version Control:

* Git
* GitHub

---

## Learning Outcomes

This project strengthened my understanding of:

* Full-stack application development
* REST API design
* Database modeling
* Real-world business rule implementation
* Revenue and billing systems
* Dynamic pricing algorithms
* Data visualization
* System architecture design

SmartPark demonstrates how software can automate real-world parking operations while maintaining accurate billing, operational transparency, and scalable management workflows.
 ┌──────────────────────────────┐
│          Frontend            │
│ HTML • Tailwind • JS • Chart │
└──────────────┬───────────────┘
               │ REST APIs
               ▼
┌──────────────────────────────┐
│        Express Server        │
│   Routing & API Layer        │
└──────────────┬───────────────┘
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Parking │ │ Billing │ │Analytics│
│ Engine  │ │ Engine  │ │ Module  │
└─────────┘ └─────────┘ └─────────┘
      │        │        │
      └────────┼────────┘
               ▼
┌──────────────────────────────┐
│          SQLite DB           │
│ Vehicles • Revenue • Logs    │
│ Transactions • Occupancy     │
└──────────────────────────────┘
